/* Authoritative scope-filtered reporting, immutable audit search and private exports. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { deflateRawSync } from 'node:zlib';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type {
  AuditEventQuery,
  CreateExportRequest,
  ExportListQuery,
  ReportRange,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import type { Queue } from 'bullmq';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { PLATFORM_BACKGROUND_QUEUE } from '../background/background-processing.lifecycle.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  BULLMQ_QUEUE_FACTORY,
  type BullMqQueueFactory,
} from '../infrastructure/redis/redis.tokens.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
const bad = (message: string) =>
  new BadRequestException({ code: 'VALIDATION_ERROR', details: [], message, retryable: false });
const missing = (message: string) =>
  new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });

interface DashboardReport {
  metrics: {
    bookings: { by_status: Record<string, number> };
    deliveries: { by_status: Record<string, number> };
    funnel: { by_status: Record<string, number> };
    registration: { overdue: number; total: number };
    reminders: { by_status: Record<string, number> };
  };
}

function zoneStart(value: string, timezone: string): Date {
  const candidate = new Date(`${value}T00:00:00.000Z`);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
    const observed = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    return new Date(candidate.getTime() - (observed - candidate.getTime()));
  } catch {
    throw bad('timezone must be a valid IANA time zone.');
  }
}
function bounds(range: ReportRange) {
  if (range.from > range.to) throw bad('from must not be later than to.');
  const start = zoneStart(range.from, range.timezone);
  const end = zoneStart(range.to, range.timezone);
  end.setUTCDate(end.getUTCDate() + 1);
  return { end, start };
}
function csvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}
function csv(rows: Record<string, unknown>[]): Uint8Array {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return Buffer.from(
    [
      headers.join(','),
      ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
    ].join('\r\n'),
    'utf8',
  );
}
function xml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function xlsx(rows: Record<string, unknown>[]): Uint8Array {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const all = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((line, row) => `<row r="${row + 1}">${line.map((entry, column) => `<c r="${String.fromCharCode(65 + column)}${row + 1}" t="inlineStr"><is><t>${xml(entry)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content);
    const compressed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    chunks.push(local, compressed);
    const directory = Buffer.alloc(46 + nameBytes.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    nameBytes.copy(directory, 46);
    central.push(directory);
    offset += local.length + compressed.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directoryBytes, end]);
}

@Injectable()
export class ReportsService {
  private backgroundQueue: Queue | undefined;
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Optional() @Inject(BULLMQ_QUEUE_FACTORY) private readonly queues?: BullMqQueueFactory,
  ) {}

  // Every reportable aggregate has identically-shaped tenant and branch UUID columns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private branchFilter<T extends { clientOrganizationId: any; branchId: any }>(
    context: AuthorizationContext,
    table: T,
    range: ReportRange,
  ) {
    const cid = clientId(context);
    const conditions = [eq(table.clientOrganizationId, cid)];
    if (range.branch_id) {
      if (!this.policy.canAccessBranch(context, range.branch_id))
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          details: [],
          message: 'The requested branch is outside your scope.',
          retryable: false,
        });
      conditions.push(eq(table.branchId, range.branch_id));
    } else if (context.branchScopeMode === 'SELECTED')
      conditions.push(inArray(table.branchId, [...context.branchIds]));
    else if (context.branchScopeMode === 'NONE')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'No branch reporting scope is active.',
        retryable: false,
      });
    return conditions;
  }

  async dashboard(context: AuthorizationContext, range: ReportRange) {
    const { start, end } = bounds(range);
    const db = this.connection.db;
    const leads = await db
      .select()
      .from(schema.leadOpportunities)
      .where(
        and(
          ...this.branchFilter(context, schema.leadOpportunities, range),
          gte(schema.leadOpportunities.capturedAt, start),
          lt(schema.leadOpportunities.capturedAt, end),
        ),
      );
    const bookings = await db
      .select()
      .from(schema.bookings)
      .where(
        and(
          ...this.branchFilter(context, schema.bookings, range),
          gte(schema.bookings.createdAt, start),
          lt(schema.bookings.createdAt, end),
        ),
      );
    const deliveries = await db
      .select()
      .from(schema.deliveryJobs)
      .where(
        and(
          ...this.branchFilter(context, schema.deliveryJobs, range),
          gte(schema.deliveryJobs.scheduledFor, start),
          lt(schema.deliveryJobs.scheduledFor, end),
        ),
      );
    const registrations = await db
      .select()
      .from(schema.registrationCases)
      .where(
        and(
          ...this.branchFilter(context, schema.registrationCases, range),
          gte(schema.registrationCases.createdAt, start),
          lt(schema.registrationCases.createdAt, end),
        ),
      );
    const reminders = await db
      .select({ status: schema.reminderInstances.status })
      .from(schema.reminderInstances)
      .innerJoin(
        schema.customerReminderPlans,
        eq(schema.customerReminderPlans.id, schema.reminderInstances.customerReminderPlanId),
      )
      .innerJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
      )
      .where(
        and(
          ...this.branchFilter(context, schema.customerVehicles, range),
          gte(schema.reminderInstances.scheduledFor, start),
          lt(schema.reminderInstances.scheduledFor, end),
        ),
      );
    const group = <T extends string>(items: { status: T }[]) =>
      Object.fromEntries(
        items.reduce(
          (map, item) => map.set(item.status, (map.get(item.status) ?? 0) + 1),
          new Map<T, number>(),
        ),
      );
    const owner = Object.fromEntries(
      leads.reduce((map, lead) => {
        const key = lead.relationshipOwnerId ?? 'UNASSIGNED';
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    );
    return {
      range: { ...range, end_at: end.toISOString(), start_at: start.toISOString() },
      kpi_definitions: {
        lead_to_booking_conversion: {
          denominator: 'Leads created in range',
          inclusion: 'Canonical leads within live branch scope',
          numerator: 'Bookings created in range',
          owner_attribution: 'relationship_owner_id',
          time_basis: 'created_at / scheduled_for',
          timezone: range.timezone,
        },
      },
      metrics: {
        bookings: { by_status: group(bookings), total: bookings.length },
        deliveries: { by_status: group(deliveries), total: deliveries.length },
        funnel: { by_status: group(leads), leads: leads.length, owner_attribution: owner },
        registration: {
          overdue: registrations.filter(
            (item) =>
              item.expectedCompletionAt !== null &&
              item.expectedCompletionAt < new Date() &&
              item.closedAt === null,
          ).length,
          total: registrations.length,
        },
        reminders: { by_status: group(reminders), total: reminders.length },
      },
    };
  }

  async auditEvents(context: AuthorizationContext, query: AuditEventQuery) {
    const cid = clientId(context);
    const { start, end } = bounds(query);
    const filters = [
      eq(schema.auditEvents.clientOrganizationId, cid),
      gte(schema.auditEvents.createdAt, start),
      lt(schema.auditEvents.createdAt, end),
    ];
    if (query.action) filters.push(eq(schema.auditEvents.action, query.action));
    if (query.actor_id) filters.push(eq(schema.auditEvents.actorId, query.actor_id));
    if (query.correlation_id)
      filters.push(eq(schema.auditEvents.correlationId, query.correlation_id));
    if (query.entity_id) filters.push(eq(schema.auditEvents.entityId, query.entity_id));
    if (query.entity_type) filters.push(eq(schema.auditEvents.entityType, query.entity_type));
    return {
      events: await this.connection.db
        .select()
        .from(schema.auditEvents)
        .where(and(...filters))
        .orderBy(desc(schema.auditEvents.createdAt))
        .limit(query.limit),
    };
  }

  async createExport(
    context: AuthorizationContext,
    input: CreateExportRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    this.branchFilter(context, schema.leadOpportunities, input.filters);
    bounds(input.filters);
    const [job] = await this.connection.db
      .insert(schema.exportJobs)
      .values({
        clientOrganizationId: cid,
        correlationId,
        filters: input.filters,
        format: input.format,
        kind: input.kind,
        requestedByMembershipId: context.membershipId,
        scopeSnapshot: {
          branch_ids: [...context.branchIds],
          branch_scope_mode: context.branchScopeMode,
          membership_id: context.membershipId,
          team_ids: [...context.managedTeamIds],
        },
      })
      .returning();
    if (!job) throw new Error('Export job creation did not return a row.');
    await this.connection.db.insert(schema.auditEvents).values({
      action: 'REPORT_EXPORT_REQUESTED',
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId,
      entityId: job.id,
      entityType: 'EXPORT_JOB',
      newSummary: { format: job.format, kind: job.kind },
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
    if (this.queues) {
      this.backgroundQueue ??= this.queues.createQueue(PLATFORM_BACKGROUND_QUEUE);
      await this.backgroundQueue.add(
        'reports.export',
        { exportJobId: job.id },
        { jobId: `reports-export-${job.id}`, removeOnComplete: true },
      );
    }
    return { export: job };
  }

  async listExports(context: AuthorizationContext, query: ExportListQuery) {
    const cid = clientId(context);
    return {
      exports: await this.connection.db
        .select()
        .from(schema.exportJobs)
        .where(
          and(
            eq(schema.exportJobs.clientOrganizationId, cid),
            eq(schema.exportJobs.requestedByMembershipId, context.membershipId),
          ),
        )
        .orderBy(desc(schema.exportJobs.createdAt))
        .limit(query.limit),
    };
  }

  async downloadExport(context: AuthorizationContext, id: string) {
    const cid = clientId(context);
    const [job] = await this.connection.db
      .select()
      .from(schema.exportJobs)
      .where(
        and(
          eq(schema.exportJobs.id, id),
          eq(schema.exportJobs.clientOrganizationId, cid),
          eq(schema.exportJobs.requestedByMembershipId, context.membershipId),
        ),
      )
      .limit(1);
    if (!job) throw missing('Export job was not found.');
    if (
      job.status !== 'COMPLETED' ||
      !job.objectKey ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    )
      throw bad('This export is not available; create a new export if it has expired.');
    const download = await this.storage.createDownloadUrl({
      downloadFileName: `gdm-${job.kind.toLowerCase()}.${job.format.toLowerCase()}`,
      expiresInSeconds: 300,
      key: job.objectKey,
    });
    await this.connection.db.insert(schema.auditEvents).values({
      action: 'REPORT_EXPORT_DOWNLOADED',
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId: `export-download-${id}`,
      entityId: id,
      entityType: 'EXPORT_JOB',
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
    return { download, export: job };
  }

  async processExport(id: string) {
    const [job] = await this.connection.db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, id))
      .limit(1);
    if (!job || job.status === 'COMPLETED') return { skipped: true };
    await this.connection.db
      .update(schema.exportJobs)
      .set({ status: 'PROCESSING' })
      .where(eq(schema.exportJobs.id, id));
    try {
      if (!this.storage.putPrivateObject)
        throw new Error('Configured object storage cannot write private export objects.');
      const scope = job.scopeSnapshot as {
        membership_id: string;
        branch_scope_mode: AuthorizationContext['branchScopeMode'];
        branch_ids: string[];
        team_ids?: string[];
      };
      const context: AuthorizationContext = {
        assignmentScope: 'ALL',
        branchIds: new Set(scope.branch_ids),
        branchScopeMode: scope.branch_scope_mode,
        clientOrganizationId: job.clientOrganizationId,
        departmentIds: new Set(),
        departmentScopeMode: 'ALL',
        managedTeamIds: new Set(scope.team_ids ?? []),
        membershipId: scope.membership_id,
        permissionCodes: new Set(),
        roleCode: 'MANAGER',
        sessionId: 'export-worker',
        teamIds: new Set(),
        teamScopeMode: 'ALL',
        userId: 'export-worker',
      };
      const range = job.filters as ReportRange;
      const report = await this.dashboard(context, range);
      const rows = this.rowsForExport(job.kind, report, context, range);
      const body = job.format === 'CSV' ? csv(rows) : xlsx(rows);
      const extension = job.format === 'CSV' ? 'csv' : 'xlsx';
      const key = `private/${job.clientOrganizationId}/exports/${job.id}.${extension}`;
      await this.storage.putPrivateObject({
        body,
        contentType:
          job.format === 'CSV'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        key,
      });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.connection.db
        .update(schema.exportJobs)
        .set({ completedAt: new Date(), expiresAt, objectKey: key, status: 'COMPLETED' })
        .where(eq(schema.exportJobs.id, id));
      return { completed: true };
    } catch (error) {
      await this.connection.db
        .update(schema.exportJobs)
        .set({
          failureCode: 'EXPORT_PROCESSING_FAILED',
          failureMessage:
            error instanceof Error ? error.message.slice(0, 1000) : 'Unknown export failure.',
          status: 'FAILED',
        })
        .where(eq(schema.exportJobs.id, id));
      throw error;
    }
  }

  private rowsForExport(
    kind: string,
    dashboard: DashboardReport,
    context: AuthorizationContext,
    range: ReportRange,
  ): Record<string, unknown>[] {
    if (kind === 'AUDIT_EVENTS') return [];
    if (kind === 'LEAD_FUNNEL')
      return Object.entries(dashboard.metrics.funnel.by_status).map(([status, count]) => ({
        count,
        status,
      }));
    if (kind === 'BOOKINGS')
      return Object.entries(dashboard.metrics.bookings.by_status).map(([status, count]) => ({
        count,
        status,
      }));
    if (kind === 'DELIVERIES')
      return Object.entries(dashboard.metrics.deliveries.by_status).map(([status, count]) => ({
        count,
        status,
      }));
    if (kind === 'REGISTRATION_AGING')
      return [
        {
          overdue: dashboard.metrics.registration.overdue,
          total: dashboard.metrics.registration.total,
        },
      ];
    if (kind === 'REMINDERS')
      return Object.entries(dashboard.metrics.reminders.by_status).map(([status, count]) => ({
        count,
        status,
      }));
    return [{ context: context.membershipId, range: JSON.stringify(range) }];
  }
}
