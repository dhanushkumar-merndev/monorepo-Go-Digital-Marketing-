/* Administrative command methods are intentionally small transaction boundaries. */
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-non-null-assertion */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AgencyDashboardQuery,
  AgencyDashboardResponse,
  AssignTeamMemberRequest,
  CreateBranchRequest,
  CreateClientRequest,
  CreateDepartmentRequest,
  CreateTeamRequest,
  EndTeamMembershipRequest,
  InviteUserRequest,
  ReplaceTeamManagerRequest,
  SetAgencyDefaultsRequest,
  SetClientSettingsRequest,
  SetClientStatusRequest,
  SetMembershipStatusRequest,
  SetReportingManagerRequest,
  SetModuleFlagRequest,
  SetWorkingHoursRequest,
  UpdateBranchRequest,
  UpdateClientRequest,
  UpdateDepartmentRequest,
  UpdateMembershipRequest,
  UpdateTeamRequest,
} from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';

const modules = [
  'LEADS',
  'TELEPHONY',
  'INBOX',
  'TEST_RIDES',
  'INVENTORY',
  'BOOKING_BILLING',
  'DELIVERY_RC',
  'POST_SALE',
  'INTEGRATIONS',
] as const;
const integrations = [
  'WHATSAPP',
  'TELEPHONY',
  'META_LEADS',
  'GOOGLE_BUSINESS',
  'GOOGLE_ADS',
  'EMAIL',
  'SMS',
] as const;
const inProgressLeadStatuses = [
  'CONTACT_ATTEMPT',
  'ACCEPTED',
  'CONTACTED',
  'INTERESTED',
  'FOLLOW_UP',
  'SHOWROOM_VISIT',
  'TEST_RIDE_REQUESTED',
  'TEST_RIDE_BOOKED',
  'TEST_RIDE_COMPLETED',
  'NEGOTIATION',
  'REOPENED',
] as const;
type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];

function nextCalendarDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1));
  return [
    String(next.getUTCFullYear()).padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function agencyDashboardBounds(range: AgencyDashboardQuery): { end: Date; start: Date } {
  if (range.from > range.to)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: [],
      message: 'from must not be later than to.',
      retryable: false,
    });
  const inTimezone = (value: string): Date => {
    const candidate = new Date(`${value}T00:00:00.000Z`);
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: range.timezone,
        year: 'numeric',
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
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [],
        message: 'timezone must be a valid IANA time zone.',
        retryable: false,
      });
    }
  };
  return { end: inTimezone(nextCalendarDate(range.to)), start: inTimezone(range.from) };
}

function conversionRate(converted: number, received: number): number {
  return received === 0 ? 0 : Math.round((converted / received) * 1_000) / 10;
}

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}
function conflict(message: string): ConflictException {
  return new ConflictException({ code: 'CONFLICT', details: [], message, retryable: false });
}

@Injectable()
export class AdministrationService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  async agencyDashboard(
    context: AuthorizationContext,
    query: AgencyDashboardQuery,
  ): Promise<AgencyDashboardResponse> {
    if (!context.agencyId || context.clientOrganizationId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency platform context is required.',
        retryable: false,
      });

    const { end, start } = agencyDashboardBounds(query);
    const lead = schema.leadOpportunities;
    const client = schema.clientOrganizations;
    const rows = await this.connection.db
      .select({
        agencyId: client.agencyId,
        clientId: client.id,
        converted: sql<number>`count(${lead.id}) filter (where ${lead.status} = 'BOOKING_CONFIRMED')::integer`,
        displayName: client.displayName,
        inProgress: sql<number>`count(${lead.id}) filter (where ${inArray(lead.status, [...inProgressLeadStatuses])})::integer`,
        leadsReceived: sql<number>`count(${lead.id})::integer`,
        legalName: client.legalName,
        lost: sql<number>`count(${lead.id}) filter (where ${lead.status} = 'LOST')::integer`,
        newLeads: sql<number>`count(${lead.id}) filter (where ${lead.status} = 'NEW')::integer`,
        pendingReview: sql<number>`count(${lead.id}) filter (where ${lead.status} = 'PENDING_REVIEW')::integer`,
        rejected: sql<number>`count(${lead.id}) filter (where ${lead.status} = 'REJECTED')::integer`,
        status: client.status,
        timezone: client.timezone,
      })
      .from(client)
      .leftJoin(
        lead,
        and(
          eq(lead.clientOrganizationId, client.id),
          gte(lead.capturedAt, start),
          lt(lead.capturedAt, end),
        ),
      )
      .where(eq(client.agencyId, context.agencyId))
      .groupBy(client.id)
      .orderBy(asc(client.displayName));

    const clients = rows.map((row) => {
      const received = Number(row.leadsReceived);
      const converted = Number(row.converted);
      return {
        client_organization: {
          agency_id: row.agencyId,
          display_name: row.displayName,
          id: row.clientId,
          legal_name: row.legalName,
          status: row.status,
          timezone: row.timezone,
        },
        converted,
        conversion_rate: conversionRate(converted, received),
        in_progress: Number(row.inProgress),
        leads_received: received,
        lost: Number(row.lost),
        new: Number(row.newLeads),
        pending_review: Number(row.pendingReview),
        rejected: Number(row.rejected),
      };
    });
    const totals = clients.reduce(
      (summary, item) => ({
        client_organizations: summary.client_organizations + 1,
        converted: summary.converted + item.converted,
        in_progress: summary.in_progress + item.in_progress,
        leads_received: summary.leads_received + item.leads_received,
        lost: summary.lost + item.lost,
        new: summary.new + item.new,
        pending_review: summary.pending_review + item.pending_review,
        rejected: summary.rejected + item.rejected,
      }),
      {
        client_organizations: 0,
        converted: 0,
        in_progress: 0,
        leads_received: 0,
        lost: 0,
        new: 0,
        pending_review: 0,
        rejected: 0,
      },
    );

    return {
      clients,
      range: {
        end_at: end.toISOString(),
        from: query.from,
        start_at: start.toISOString(),
        timezone: query.timezone,
        to: query.to,
      },
      totals: {
        ...totals,
        conversion_rate: conversionRate(totals.converted, totals.leads_received),
      },
    };
  }

  private async audit(
    tx: Tx,
    context: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    oldSummary: Record<string, unknown> | null,
    newSummary: Record<string, unknown> | null,
    reason?: string,
  ): Promise<void> {
    await tx.insert(schema.auditEvents).values({
      scope: context.clientOrganizationId ? 'CLIENT' : 'PLATFORM',
      ...(context.clientOrganizationId
        ? { clientOrganizationId: context.clientOrganizationId }
        : {}),
      actorId: context.userId,
      actorType: 'USER',
      effectiveRole: context.roleCode,
      action,
      entityType,
      entityId,
      outcome: 'SUCCESS',
      oldSummary,
      newSummary,
      ...(reason ? { reason } : {}),
      correlationId: context.sessionId,
    });
  }

  async createClient(context: AuthorizationContext, body: CreateClientRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [defaults] = await tx
        .select()
        .from(schema.agencyDefaults)
        .where(eq(schema.agencyDefaults.agencyId, context.agencyId!))
        .limit(1);
      const [client] = await tx
        .insert(schema.clientOrganizations)
        .values({
          agencyId: context.agencyId!,
          code: body.code,
          displayName: body.display_name,
          legalName: body.legal_name,
          timezone: body.timezone,
          status: 'PENDING',
        })
        .returning();
      if (!client) throw new Error('Client organization creation did not return a row.');
      await tx
        .insert(schema.clientAdministrationSettings)
        .values({ clientOrganizationId: client.id });
      await tx
        .insert(schema.clientIntegrationReadiness)
        .values(
          integrations.map((integration) => ({ clientOrganizationId: client.id, integration })),
        );
      await tx.insert(schema.clientModuleFlags).values(
        modules.map((module) => ({
          clientOrganizationId: client.id,
          module,
          enabled: defaults?.defaultFeatureFlags[module] === true,
          reason:
            defaults?.defaultFeatureFlags[module] === true
              ? 'Enabled by safe agency default'
              : 'Not enabled during onboarding',
        })),
      );
      await this.audit(tx, context, 'CLIENT_CREATED', 'client_organization', client.id, null, {
        code: client.code,
        status: client.status,
      });
      return {
        client_organization: {
          id: client.id,
          agency_id: client.agencyId,
          legal_name: client.legalName,
          display_name: client.displayName,
          status: client.status,
          timezone: client.timezone,
        },
      };
    });
  }

  async clientDetail(context: AuthorizationContext, id: string) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    const [client] = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(
        and(
          eq(schema.clientOrganizations.id, id),
          eq(schema.clientOrganizations.agencyId, context.agencyId),
        ),
      )
      .limit(1);
    if (!client) throw notFound('The client organization was not found.');
    const [branchCount, teamCount, userCount] = await Promise.all([
      this.connection.db
        .select({ value: count() })
        .from(schema.branches)
        .where(eq(schema.branches.clientOrganizationId, id)),
      this.connection.db
        .select({ value: count() })
        .from(schema.teams)
        .where(eq(schema.teams.clientOrganizationId, id)),
      this.connection.db
        .select({ value: count() })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.clientOrganizationId, id),
            eq(schema.memberships.status, 'ACTIVE'),
          ),
        ),
    ]);
    return {
      client_organization: {
        id: client.id,
        agency_id: client.agencyId,
        legal_name: client.legalName,
        display_name: client.displayName,
        status: client.status,
        timezone: client.timezone,
      },
      usage: {
        branches: branchCount[0]?.value ?? 0,
        teams: teamCount[0]?.value ?? 0,
        active_users: userCount[0]?.value ?? 0,
      },
    };
  }

  async setClientStatus(context: AuthorizationContext, id: string, body: SetClientStatusRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientOrganizations)
        .where(
          and(
            eq(schema.clientOrganizations.id, id),
            eq(schema.clientOrganizations.agencyId, context.agencyId!),
          ),
        )
        .for('update')
        .limit(1);
      if (!before) throw notFound('The client organization was not found.');
      const [client] = await tx
        .update(schema.clientOrganizations)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(schema.clientOrganizations.id, id))
        .returning();
      if (body.status === 'SUSPENDED')
        await tx
          .update(schema.refreshSessions)
          .set({ revokedAt: new Date(), revokedReason: 'CLIENT_SUSPENDED' })
          .where(
            and(
              eq(
                schema.refreshSessions.currentMembershipId,
                sql`any(select id from memberships where client_organization_id = ${id})`,
              ),
              isNull(schema.refreshSessions.revokedAt),
            ),
          );
      await this.audit(
        tx,
        context,
        body.status === 'SUSPENDED'
          ? 'CLIENT_SUSPENDED'
          : before.status === 'PENDING'
            ? 'CLIENT_ACTIVATED'
            : 'CLIENT_REACTIVATED',
        'client_organization',
        id,
        { status: before.status },
        { status: body.status },
        body.reason,
      );
      return {
        client_organization: {
          id: client!.id,
          agency_id: client!.agencyId,
          legal_name: client!.legalName,
          display_name: client!.displayName,
          status: client!.status,
          timezone: client!.timezone,
        },
      };
    });
  }

  async updateClient(context: AuthorizationContext, body: UpdateClientRequest) {
    const id = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientOrganizations)
        .where(eq(schema.clientOrganizations.id, id))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The client organization was not found.');
      const [updated] = await tx
        .update(schema.clientOrganizations)
        .set({
          displayName: body.display_name,
          legalName: body.legal_name,
          timezone: body.timezone,
          settingsVersion: before.settingsVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.clientOrganizations.id, id))
        .returning();
      await this.audit(
        tx,
        context,
        'CLIENT_PROFILE_UPDATED',
        'client_organization',
        id,
        {
          display_name: before.displayName,
          legal_name: before.legalName,
          timezone: before.timezone,
        },
        { ...body },
      );
      return { client_organization: this.client(updated!) };
    });
  }

  async clientProfile(context: AuthorizationContext) {
    const [client] = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(eq(schema.clientOrganizations.id, clientId(context)))
      .limit(1);
    if (!client) throw notFound('The client organization was not found.');
    return { client_organization: this.client(client) };
  }

  async createBranch(context: AuthorizationContext, body: CreateBranchRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.branches)
        .values({
          clientOrganizationId: cid,
          code: body.code,
          name: body.name,
          timezone: body.timezone,
        })
        .returning();
      await this.audit(tx, context, 'BRANCH_CREATED', 'branch', row!.id, null, {
        code: row!.code,
        name: row!.name,
      });
      return { branch: this.branch(row!) };
    });
  }
  async updateBranch(context: AuthorizationContext, id: string, body: UpdateBranchRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, id), eq(schema.branches.clientOrganizationId, cid)))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The branch was not found.');
      const [row] = await tx
        .update(schema.branches)
        .set({
          ...{ code: body.code, name: body.name, timezone: body.timezone, active: body.active },
          updatedAt: new Date(),
        })
        .where(eq(schema.branches.id, id))
        .returning();
      await this.audit(
        tx,
        context,
        'BRANCH_UPDATED',
        'branch',
        id,
        this.branch(before),
        this.branch(row!),
      );
      return { branch: this.branch(row!) };
    });
  }
  async createTeam(context: AuthorizationContext, body: CreateTeamRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.id, body.branch_id),
            eq(schema.branches.clientOrganizationId, cid),
          ),
        )
        .limit(1);
      if (!branch) throw notFound('The branch was not found.');
      const [department] = await tx
        .select()
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.id, body.department_id),
            eq(schema.departments.clientOrganizationId, cid),
            eq(schema.departments.branchId, body.branch_id),
            eq(schema.departments.active, true),
          ),
        )
        .limit(1);
      if (!department) throw conflict('The department does not belong to the selected branch.');
      const [row] = await tx
        .insert(schema.teams)
        .values({
          clientOrganizationId: cid,
          branchId: body.branch_id,
          departmentId: body.department_id,
          code: body.code,
          name: body.name,
        })
        .returning();
      await this.audit(tx, context, 'TEAM_CREATED', 'team', row!.id, null, this.team(row!));
      return { team: this.team(row!) };
    });
  }

  async createDepartment(context: AuthorizationContext, body: CreateDepartmentRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.id, body.branch_id),
            eq(schema.branches.clientOrganizationId, cid),
            eq(schema.branches.active, true),
          ),
        )
        .limit(1);
      if (!branch) throw notFound('The active branch was not found.');
      const [row] = await tx
        .insert(schema.departments)
        .values({
          branchId: body.branch_id,
          clientOrganizationId: cid,
          code: body.code,
          name: body.name,
        })
        .returning();
      await this.audit(
        tx,
        context,
        'DEPARTMENT_CREATED',
        'department',
        row!.id,
        null,
        this.department(row!),
      );
      return { department: this.department(row!) };
    });
  }

  async updateDepartment(context: AuthorizationContext, id: string, body: UpdateDepartmentRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.departments)
        .where(and(eq(schema.departments.id, id), eq(schema.departments.clientOrganizationId, cid)))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The department was not found.');
      const [row] = await tx
        .update(schema.departments)
        .set({ active: body.active, code: body.code, name: body.name, updatedAt: new Date() })
        .where(eq(schema.departments.id, id))
        .returning();
      await this.audit(
        tx,
        context,
        'DEPARTMENT_UPDATED',
        'department',
        id,
        this.department(before),
        this.department(row!),
      );
      return { department: this.department(row!) };
    });
  }
  async updateTeam(context: AuthorizationContext, id: string, body: UpdateTeamRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.teams)
        .where(and(eq(schema.teams.id, id), eq(schema.teams.clientOrganizationId, cid)))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The team was not found.');
      const [row] = await tx
        .update(schema.teams)
        .set({ code: body.code, name: body.name, active: body.active, updatedAt: new Date() })
        .where(eq(schema.teams.id, id))
        .returning();
      await this.audit(tx, context, 'TEAM_UPDATED', 'team', id, this.team(before), this.team(row!));
      return { team: this.team(row!) };
    });
  }

  async setWorkingHours(
    context: AuthorizationContext,
    branchId: string,
    body: SetWorkingHoursRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, branchId), eq(schema.branches.clientOrganizationId, cid)))
        .limit(1);
      if (!branch) throw notFound('The branch was not found.');
      const existing = await tx
        .select()
        .from(schema.branchWorkingHours)
        .where(
          and(
            eq(schema.branchWorkingHours.clientOrganizationId, cid),
            eq(schema.branchWorkingHours.branchId, branchId),
          ),
        );
      await tx
        .delete(schema.branchWorkingHours)
        .where(
          and(
            eq(schema.branchWorkingHours.clientOrganizationId, cid),
            eq(schema.branchWorkingHours.branchId, branchId),
          ),
        );
      await tx.insert(schema.branchWorkingHours).values(
        body.hours.map((entry) => ({
          clientOrganizationId: cid,
          branchId,
          dayOfWeek: entry.day_of_week,
          isClosed: entry.is_closed,
          opensAt: entry.opens_at,
          closesAt: entry.closes_at,
          version: (existing[0]?.version ?? 0) + 1,
        })),
      );
      await this.audit(
        tx,
        context,
        'BRANCH_WORKING_HOURS_UPDATED',
        'branch',
        branchId,
        { hours: existing },
        { hours: body.hours },
      );
      return { branch_id: branchId, hours: body.hours, version: (existing[0]?.version ?? 0) + 1 };
    });
  }

  async workingHours(context: AuthorizationContext, branchId: string) {
    const cid = clientId(context);
    const [branch] = await this.connection.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, branchId), eq(schema.branches.clientOrganizationId, cid)))
      .limit(1);
    if (!branch) throw notFound('The branch was not found.');
    const rows = await this.connection.db
      .select()
      .from(schema.branchWorkingHours)
      .where(
        and(
          eq(schema.branchWorkingHours.clientOrganizationId, cid),
          eq(schema.branchWorkingHours.branchId, branchId),
        ),
      )
      .orderBy(asc(schema.branchWorkingHours.dayOfWeek));
    return {
      branch_id: branchId,
      hours: rows.map((row) => ({
        day_of_week: row.dayOfWeek,
        is_closed: row.isClosed,
        opens_at: row.opensAt,
        closes_at: row.closesAt,
      })),
      version: rows[0]?.version ?? 1,
    };
  }

  async inviteUser(context: AuthorizationContext, body: InviteUserRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(
          and(
            eq(schema.roles.code, body.role_code),
            eq(schema.roles.contextType, 'CLIENT'),
            eq(schema.roles.active, true),
          ),
        )
        .limit(1);
      if (!role) throw conflict('The selected role is unavailable.');
      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.primaryEmailNormalized, body.email))
        .limit(1);
      const target =
        user ??
        (
          await tx
            .insert(schema.users)
            .values({
              displayName: body.display_name,
              primaryEmailNormalized: body.email,
              status: 'INVITED',
            })
            .returning()
        )[0];
      if (!target) throw new Error('User invitation creation did not return a row.');
      const [existing] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, target.id),
            eq(schema.memberships.clientOrganizationId, cid),
            inArray(schema.memberships.status, ['ACTIVE', 'INVITED', 'SUSPENDED']),
          ),
        )
        .limit(1);
      if (existing)
        throw conflict('This employee already has a current membership for the client.');
      await this.assertScopes(tx, cid, body.branch_ids, body.department_ids, body.team_ids);
      const [membership] = await tx
        .insert(schema.memberships)
        .values({
          userId: target.id,
          contextType: 'CLIENT',
          clientOrganizationId: cid,
          roleId: role.id,
          status: 'INVITED',
          branchScopeMode: body.branch_scope_mode,
          departmentScopeMode: body.department_scope_mode,
          jobTitle: body.job_title,
          teamScopeMode: body.team_scope_mode,
          assignmentScope: body.assignment_scope,
        })
        .returning();
      await this.insertScopes(
        tx,
        cid,
        membership!.id,
        body.branch_ids,
        body.department_ids,
        body.team_ids,
      );
      await this.audit(tx, context, 'USER_INVITED', 'membership', membership!.id, null, {
        email: target.primaryEmailNormalized,
        role_code: body.role_code,
        branch_ids: body.branch_ids,
        department_ids: body.department_ids,
        department_scope_mode: body.department_scope_mode,
        job_title: body.job_title,
        team_ids: body.team_ids,
      });
      return {
        user: {
          user_id: target.id,
          display_name: target.displayName,
          email: target.primaryEmailNormalized,
          user_status: target.status,
          membership_id: membership!.id,
          membership_status: membership!.status,
          role_code: body.role_code,
          branch_scope_mode: body.branch_scope_mode,
          branch_ids: body.branch_ids,
          department_scope_mode: body.department_scope_mode,
          department_ids: body.department_ids,
          job_title: body.job_title,
          team_scope_mode: body.team_scope_mode,
          team_ids: body.team_ids,
          assignment_scope: body.assignment_scope,
        },
        invitation_delivery: 'UNAVAILABLE' as const,
      };
    });
  }

  async updateMembership(
    context: AuthorizationContext,
    membershipId: string,
    body: UpdateMembershipRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const before = await this.membershipForUpdate(tx, cid, membershipId);
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(
          and(
            eq(schema.roles.code, body.role_code),
            eq(schema.roles.contextType, 'CLIENT'),
            eq(schema.roles.active, true),
          ),
        )
        .limit(1);
      if (!role) throw conflict('The selected role is unavailable.');
      await this.assertScopes(tx, cid, body.branch_ids, body.department_ids, body.team_ids);
      await this.ensureClientAdmin(tx, cid, before.roleCode, body.role_code, before.status);
      const [updated] = await tx
        .update(schema.memberships)
        .set({
          roleId: role.id,
          branchScopeMode: body.branch_scope_mode,
          departmentScopeMode: body.department_scope_mode,
          jobTitle: body.job_title,
          teamScopeMode: body.team_scope_mode,
          assignmentScope: body.assignment_scope,
          updatedAt: new Date(),
        })
        .where(eq(schema.memberships.id, membershipId))
        .returning();
      await tx
        .delete(schema.membershipBranchScopes)
        .where(eq(schema.membershipBranchScopes.membershipId, membershipId));
      await tx
        .delete(schema.membershipDepartmentScopes)
        .where(eq(schema.membershipDepartmentScopes.membershipId, membershipId));
      await tx
        .delete(schema.membershipTeamScopes)
        .where(eq(schema.membershipTeamScopes.membershipId, membershipId));
      await this.insertScopes(
        tx,
        cid,
        membershipId,
        body.branch_ids,
        body.department_ids,
        body.team_ids,
      );
      await tx
        .update(schema.refreshSessions)
        .set({ revokedAt: new Date(), revokedReason: 'ROLE_OR_SCOPE_CHANGED' })
        .where(
          and(
            eq(schema.refreshSessions.currentMembershipId, membershipId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        );
      await this.audit(
        tx,
        context,
        'MEMBERSHIP_ROLE_OR_SCOPE_UPDATED',
        'membership',
        membershipId,
        before,
        {
          role_code: body.role_code,
          branch_scope_mode: body.branch_scope_mode,
          branch_ids: body.branch_ids,
          department_scope_mode: body.department_scope_mode,
          department_ids: body.department_ids,
          job_title: body.job_title,
          team_scope_mode: body.team_scope_mode,
          team_ids: body.team_ids,
          assignment_scope: body.assignment_scope,
        },
      );
      return this.presentMembership(
        updated!,
        before.user,
        body.role_code,
        body.branch_ids,
        body.department_ids,
        body.team_ids,
      );
    });
  }
  async setMembershipStatus(
    context: AuthorizationContext,
    membershipId: string,
    body: SetMembershipStatusRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const before = await this.membershipForUpdate(tx, cid, membershipId);
      await this.ensureClientAdmin(tx, cid, before.roleCode, before.roleCode, body.status);
      const [updated] = await tx
        .update(schema.memberships)
        .set({
          status: body.status,
          updatedAt: new Date(),
          ...(body.status === 'ENDED' ? { effectiveUntil: new Date() } : {}),
        })
        .where(eq(schema.memberships.id, membershipId))
        .returning();
      await tx
        .update(schema.refreshSessions)
        .set({ revokedAt: new Date(), revokedReason: `MEMBERSHIP_${body.status}` })
        .where(
          and(
            eq(schema.refreshSessions.currentMembershipId, membershipId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        );
      await this.audit(
        tx,
        context,
        'MEMBERSHIP_STATUS_UPDATED',
        'membership',
        membershipId,
        { status: before.status },
        { status: body.status },
        body.reason,
      );
      return this.presentMembership(
        updated!,
        before.user,
        before.roleCode,
        before.branchIds,
        before.departmentIds,
        before.teamIds,
      );
    });
  }

  async membership(context: AuthorizationContext, membershipId: string) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const row = await this.membershipForUpdate(tx, cid, membershipId);
      return this.presentMembership(
        row,
        row.user,
        row.roleCode,
        row.branchIds,
        row.departmentIds,
        row.teamIds,
      );
    });
  }

  async hierarchy(context: AuthorizationContext) {
    const cid = clientId(context);
    const [departments, teams, teamMembers, teamManagers, reporting] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.departments)
        .where(eq(schema.departments.clientOrganizationId, cid))
        .orderBy(asc(schema.departments.name)),
      this.connection.db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.clientOrganizationId, cid))
        .orderBy(asc(schema.teams.name)),
      this.connection.db
        .select()
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.clientOrganizationId, cid),
            isNull(schema.teamMemberships.endedAt),
          ),
        ),
      this.connection.db
        .select()
        .from(schema.teamManagerAssignments)
        .where(
          and(
            eq(schema.teamManagerAssignments.clientOrganizationId, cid),
            isNull(schema.teamManagerAssignments.endedAt),
          ),
        ),
      this.connection.db
        .select()
        .from(schema.reportingLines)
        .where(
          and(
            eq(schema.reportingLines.clientOrganizationId, cid),
            isNull(schema.reportingLines.endedAt),
          ),
        ),
    ]);
    const visibleTeams = teams.filter((team) => this.actorCanAccessTeam(context, team));
    const visibleTeamIds = new Set(visibleTeams.map((team) => team.id));
    const visibleMembershipIds = new Set(
      teamMembers.filter((row) => visibleTeamIds.has(row.teamId)).map((row) => row.membershipId),
    );
    return {
      departments: departments
        .filter((department) => this.actorCanAccessDepartment(context, department))
        .map((department) => this.department(department)),
      teams: visibleTeams.map((team) => this.team(team)),
      team_memberships: teamMembers
        .filter((row) => visibleTeamIds.has(row.teamId))
        .map((row) => ({
          id: row.id,
          membership_id: row.membershipId,
          started_at: row.startedAt.toISOString(),
          team_id: row.teamId,
        })),
      team_manager_assignments: teamManagers
        .filter((row) => visibleTeamIds.has(row.teamId))
        .map((row) => ({
          id: row.id,
          manager_membership_id: row.managerMembershipId,
          started_at: row.startedAt.toISOString(),
          team_id: row.teamId,
        })),
      reporting_lines: reporting
        .filter(
          (row) =>
            visibleMembershipIds.has(row.subordinateMembershipId) ||
            visibleMembershipIds.has(row.managerMembershipId),
        )
        .map((row) => ({
          id: row.id,
          manager_membership_id: row.managerMembershipId,
          started_at: row.startedAt.toISOString(),
          subordinate_membership_id: row.subordinateMembershipId,
        })),
    };
  }

  async assignTeamMember(
    context: AuthorizationContext,
    teamId: string,
    body: AssignTeamMemberRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const team = await this.hierarchyTeam(tx, cid, teamId);
      this.requireActorTeamScope(context, team);
      const membership = await this.activeHierarchyMembership(tx, cid, body.membership_id);
      await this.requireMembershipEligibleForTeam(tx, membership, team);
      const [row] = await tx
        .insert(schema.teamMemberships)
        .values({
          assignedBy: context.userId,
          branchId: team.branchId,
          clientOrganizationId: cid,
          departmentId: team.departmentId,
          membershipId: body.membership_id,
          reason: body.reason,
          teamId,
        })
        .returning();
      await this.audit(
        tx,
        context,
        'TEAM_MEMBER_ASSIGNED',
        'team_membership',
        row!.id,
        null,
        { membership_id: body.membership_id, team_id: teamId },
        body.reason,
      );
      return { id: row!.id, membership_id: body.membership_id, team_id: teamId };
    });
  }

  async endTeamMembership(
    context: AuthorizationContext,
    teamMembershipId: string,
    body: EndTeamMembershipRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.id, teamMembershipId),
            eq(schema.teamMemberships.clientOrganizationId, cid),
            isNull(schema.teamMemberships.endedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!before) throw notFound('The active team membership was not found.');
      const team = await this.hierarchyTeam(tx, cid, before.teamId);
      this.requireActorTeamScope(context, team);
      const endedAt = new Date();
      await tx
        .update(schema.teamMemberships)
        .set({ endedAt })
        .where(eq(schema.teamMemberships.id, teamMembershipId));
      await this.audit(
        tx,
        context,
        'TEAM_MEMBER_REMOVED',
        'team_membership',
        teamMembershipId,
        { membership_id: before.membershipId, team_id: before.teamId },
        { ended_at: endedAt.toISOString() },
        body.reason,
      );
      return { ended_at: endedAt.toISOString(), id: teamMembershipId };
    });
  }

  async replaceTeamManager(
    context: AuthorizationContext,
    teamId: string,
    body: ReplaceTeamManagerRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const team = await this.hierarchyTeam(tx, cid, teamId);
      this.requireActorTeamScope(context, team);
      const manager = await this.activeHierarchyMembership(tx, cid, body.manager_membership_id);
      if (manager.roleCode !== 'TEAM_MANAGER')
        throw conflict('The selected membership must use the Team Manager role profile.');
      await this.requireMembershipEligibleForTeam(tx, manager, team);
      const now = new Date();
      const [before] = await tx
        .select()
        .from(schema.teamManagerAssignments)
        .where(
          and(
            eq(schema.teamManagerAssignments.clientOrganizationId, cid),
            eq(schema.teamManagerAssignments.teamId, teamId),
            isNull(schema.teamManagerAssignments.endedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (before?.managerMembershipId === body.manager_membership_id)
        throw conflict('This membership is already the current Team Manager.');
      if (before)
        await tx
          .update(schema.teamManagerAssignments)
          .set({ endedAt: now })
          .where(eq(schema.teamManagerAssignments.id, before.id));
      const [row] = await tx
        .insert(schema.teamManagerAssignments)
        .values({
          assignedBy: context.userId,
          branchId: team.branchId,
          clientOrganizationId: cid,
          departmentId: team.departmentId,
          managerMembershipId: body.manager_membership_id,
          reason: body.reason,
          startedAt: now,
          teamId,
        })
        .returning();
      await this.audit(
        tx,
        context,
        'TEAM_MANAGER_REPLACED',
        'team_manager_assignment',
        row!.id,
        before ? { manager_membership_id: before.managerMembershipId } : null,
        { manager_membership_id: body.manager_membership_id, team_id: teamId },
        body.reason,
      );
      return {
        id: row!.id,
        manager_membership_id: body.manager_membership_id,
        team_id: teamId,
      };
    });
  }

  async setReportingManager(
    context: AuthorizationContext,
    subordinateMembershipId: string,
    body: SetReportingManagerRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      await this.activeHierarchyMembership(tx, cid, subordinateMembershipId);
      await this.requireActorMembershipScope(tx, context, subordinateMembershipId);
      if (body.manager_membership_id === subordinateMembershipId)
        throw conflict('A membership cannot report to itself.');
      if (body.manager_membership_id) {
        await this.activeHierarchyMembership(tx, cid, body.manager_membership_id);
        await this.requireActorMembershipScope(tx, context, body.manager_membership_id);
      }
      const [before] = await tx
        .select()
        .from(schema.reportingLines)
        .where(
          and(
            eq(schema.reportingLines.clientOrganizationId, cid),
            eq(schema.reportingLines.subordinateMembershipId, subordinateMembershipId),
            isNull(schema.reportingLines.endedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (before?.managerMembershipId === body.manager_membership_id)
        throw conflict('This reporting relationship is already current.');
      if (body.manager_membership_id)
        await this.rejectReportingCycle(
          tx,
          cid,
          subordinateMembershipId,
          body.manager_membership_id,
        );
      const now = new Date();
      if (before)
        await tx
          .update(schema.reportingLines)
          .set({ endedAt: now })
          .where(eq(schema.reportingLines.id, before.id));
      const [row] = body.manager_membership_id
        ? await tx
            .insert(schema.reportingLines)
            .values({
              assignedBy: context.userId,
              clientOrganizationId: cid,
              managerMembershipId: body.manager_membership_id,
              reason: body.reason,
              startedAt: now,
              subordinateMembershipId,
            })
            .returning()
        : [];
      await this.audit(
        tx,
        context,
        'REPORTING_MANAGER_CHANGED',
        'membership',
        subordinateMembershipId,
        before ? { manager_membership_id: before.managerMembershipId } : null,
        { manager_membership_id: body.manager_membership_id },
        body.reason,
      );
      return {
        id: row?.id ?? null,
        manager_membership_id: body.manager_membership_id,
        subordinate_membership_id: subordinateMembershipId,
      };
    });
  }

  async settings(context: AuthorizationContext) {
    const cid = clientId(context);
    const [settings] = await this.connection.db
      .select()
      .from(schema.clientAdministrationSettings)
      .where(eq(schema.clientAdministrationSettings.clientOrganizationId, cid))
      .limit(1);
    return {
      lead_assignment_ready: settings?.leadAssignmentReady ?? false,
      retention_policy: settings?.retentionPolicy ?? {},
      version: settings?.version ?? 1,
    };
  }
  async setSettings(context: AuthorizationContext, body: SetClientSettingsRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientAdministrationSettings)
        .where(eq(schema.clientAdministrationSettings.clientOrganizationId, cid))
        .limit(1);
      const value = {
        leadAssignmentReady: body.lead_assignment_ready,
        retentionPolicy: body.retention_policy,
        version: (before?.version ?? 0) + 1,
        updatedAt: new Date(),
      };
      await tx
        .insert(schema.clientAdministrationSettings)
        .values({ clientOrganizationId: cid, ...value })
        .onConflictDoUpdate({
          target: schema.clientAdministrationSettings.clientOrganizationId,
          set: value,
        });
      await this.audit(
        tx,
        context,
        'CLIENT_SETTINGS_UPDATED',
        'client_administration_settings',
        cid,
        before
          ? {
              lead_assignment_ready: before.leadAssignmentReady,
              retention_policy: before.retentionPolicy,
            }
          : null,
        body,
      );
      return {
        lead_assignment_ready: value.leadAssignmentReady,
        retention_policy: value.retentionPolicy,
        version: value.version,
      };
    });
  }
  async flags(context: AuthorizationContext) {
    const rows = await this.connection.db
      .select()
      .from(schema.clientModuleFlags)
      .where(eq(schema.clientModuleFlags.clientOrganizationId, clientId(context)))
      .orderBy(asc(schema.clientModuleFlags.module));
    return {
      flags: rows.map((row) => ({
        module: row.module as (typeof modules)[number],
        enabled: row.enabled,
        reason: row.reason ?? null,
      })),
    };
  }
  async setFlag(
    context: AuthorizationContext,
    module: (typeof modules)[number],
    body: SetModuleFlagRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientModuleFlags)
        .where(
          and(
            eq(schema.clientModuleFlags.clientOrganizationId, cid),
            eq(schema.clientModuleFlags.module, module),
          ),
        )
        .limit(1);
      await tx
        .insert(schema.clientModuleFlags)
        .values({
          clientOrganizationId: cid,
          module,
          enabled: body.enabled,
          reason: body.reason ?? undefined,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.clientModuleFlags.clientOrganizationId, schema.clientModuleFlags.module],
          set: { enabled: body.enabled, reason: body.reason ?? undefined, updatedAt: new Date() },
        });
      await this.audit(
        tx,
        context,
        'CLIENT_MODULE_FLAG_UPDATED',
        'client_module_flag',
        `${cid}:${module}`,
        before ? { enabled: before.enabled, reason: before.reason } : null,
        { enabled: body.enabled, reason: body.reason },
      );
      return this.flags(context);
    });
  }
  async integrations(context: AuthorizationContext) {
    const rows = await this.connection.db
      .select()
      .from(schema.clientIntegrationReadiness)
      .where(eq(schema.clientIntegrationReadiness.clientOrganizationId, clientId(context)))
      .orderBy(asc(schema.clientIntegrationReadiness.integration));
    return {
      integrations: rows.map((row) => ({
        integration: row.integration,
        status: row.status as 'NOT_CONNECTED',
        detail: row.detail ?? null,
      })),
    };
  }
  async defaults(context: AuthorizationContext) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    const [row] = await this.connection.db
      .select()
      .from(schema.agencyDefaults)
      .where(eq(schema.agencyDefaults.agencyId, context.agencyId))
      .limit(1);
    return {
      default_timezone: row?.defaultTimezone ?? 'Asia/Kolkata',
      default_feature_flags: row?.defaultFeatureFlags ?? {},
    };
  }
  async setDefaults(context: AuthorizationContext, body: SetAgencyDefaultsRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.agencyDefaults)
        .where(eq(schema.agencyDefaults.agencyId, context.agencyId!))
        .limit(1);
      await tx
        .insert(schema.agencyDefaults)
        .values({
          agencyId: context.agencyId!,
          defaultTimezone: body.default_timezone,
          defaultFeatureFlags: body.default_feature_flags,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.agencyDefaults.agencyId,
          set: {
            defaultTimezone: body.default_timezone,
            defaultFeatureFlags: body.default_feature_flags,
            updatedAt: new Date(),
          },
        });
      await this.audit(
        tx,
        context,
        'AGENCY_DEFAULTS_UPDATED',
        'agency_defaults',
        context.agencyId!,
        before
          ? {
              default_timezone: before.defaultTimezone,
              default_feature_flags: before.defaultFeatureFlags,
            }
          : null,
        body,
      );
      return {
        default_timezone: body.default_timezone,
        default_feature_flags: body.default_feature_flags,
      };
    });
  }
  async auditTimeline(context: AuthorizationContext) {
    const cid = clientId(context);
    const rows = await this.connection.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.clientOrganizationId, cid))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(100);
    return {
      events: rows.map((row) => ({
        action: row.action,
        actor_id: row.actorId ?? null,
        created_at: row.createdAt.toISOString(),
        entity_id: row.entityId,
        entity_type: row.entityType,
        old_summary: row.oldSummary,
        new_summary: row.newSummary,
        reason: row.reason ?? null,
      })),
    };
  }

  private branch(row: typeof schema.branches.$inferSelect) {
    return {
      id: row.id,
      client_organization_id: row.clientOrganizationId,
      code: row.code,
      name: row.name,
      timezone: row.timezone,
      active: row.active,
    };
  }
  private client(row: typeof schema.clientOrganizations.$inferSelect) {
    return {
      id: row.id,
      agency_id: row.agencyId,
      legal_name: row.legalName,
      display_name: row.displayName,
      status: row.status,
      timezone: row.timezone,
    };
  }
  private team(row: typeof schema.teams.$inferSelect) {
    return {
      id: row.id,
      client_organization_id: row.clientOrganizationId,
      branch_id: row.branchId,
      department_id: row.departmentId,
      code: row.code,
      name: row.name,
      active: row.active,
    };
  }
  private department(row: typeof schema.departments.$inferSelect) {
    return {
      active: row.active,
      branch_id: row.branchId,
      client_organization_id: row.clientOrganizationId,
      code: row.code,
      id: row.id,
      name: row.name,
    };
  }
  private actorCanAccessDepartment(
    context: AuthorizationContext,
    department: typeof schema.departments.$inferSelect,
  ): boolean {
    return (
      context.clientOrganizationId === department.clientOrganizationId &&
      (context.branchScopeMode === 'ALL' || context.branchIds.has(department.branchId)) &&
      (context.departmentScopeMode === 'ALL' || context.departmentIds.has(department.id))
    );
  }
  private actorCanAccessTeam(
    context: AuthorizationContext,
    team: typeof schema.teams.$inferSelect,
  ): boolean {
    if (
      context.clientOrganizationId !== team.clientOrganizationId ||
      (context.branchScopeMode !== 'ALL' && !context.branchIds.has(team.branchId)) ||
      (context.departmentScopeMode !== 'ALL' && !context.departmentIds.has(team.departmentId))
    )
      return false;
    if (context.roleCode === 'TEAM_MANAGER') return context.managedTeamIds.has(team.id);
    return context.teamScopeMode === 'ALL' || context.teamIds.has(team.id);
  }
  private requireActorTeamScope(
    context: AuthorizationContext,
    team: typeof schema.teams.$inferSelect,
  ): void {
    if (this.actorCanAccessTeam(context, team)) return;
    throw new ForbiddenException({
      code: 'SCOPE_DENIED',
      details: [],
      message: 'The team is outside your management scope.',
      retryable: false,
    });
  }
  private async hierarchyTeam(tx: Tx, cid: string, teamId: string) {
    const [team] = await tx
      .select()
      .from(schema.teams)
      .where(and(eq(schema.teams.clientOrganizationId, cid), eq(schema.teams.id, teamId)))
      .limit(1);
    if (!team) throw notFound('The team was not found.');
    return team;
  }
  private async activeHierarchyMembership(tx: Tx, cid: string, membershipId: string) {
    const [row] = await tx
      .select({ membership: schema.memberships, roleCode: schema.roles.code })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!row) throw conflict('The selected membership is not active in this client.');
    return { ...row.membership, roleCode: row.roleCode };
  }
  private async requireMembershipEligibleForTeam(
    tx: Tx,
    membership: typeof schema.memberships.$inferSelect & { roleCode: string },
    team: typeof schema.teams.$inferSelect,
  ): Promise<void> {
    const [branchScopes, departmentScopes] = await Promise.all([
      membership.branchScopeMode === 'SELECTED'
        ? tx
            .select({ id: schema.membershipBranchScopes.branchId })
            .from(schema.membershipBranchScopes)
            .where(eq(schema.membershipBranchScopes.membershipId, membership.id))
        : Promise.resolve([]),
      membership.departmentScopeMode === 'SELECTED'
        ? tx
            .select({ id: schema.membershipDepartmentScopes.departmentId })
            .from(schema.membershipDepartmentScopes)
            .where(eq(schema.membershipDepartmentScopes.membershipId, membership.id))
        : Promise.resolve([]),
    ]);
    const branchEligible =
      membership.branchScopeMode === 'ALL' || branchScopes.some((row) => row.id === team.branchId);
    const departmentEligible =
      membership.departmentScopeMode === 'ALL' ||
      departmentScopes.some((row) => row.id === team.departmentId);
    if (branchEligible && departmentEligible) return;
    throw conflict(
      'The selected membership scope does not include this team branch and department.',
    );
  }
  private async requireActorMembershipScope(
    tx: Tx,
    context: AuthorizationContext,
    membershipId: string,
  ): Promise<void> {
    if (
      context.branchScopeMode === 'ALL' &&
      context.departmentScopeMode === 'ALL' &&
      context.teamScopeMode === 'ALL'
    )
      return;
    const rows = await tx
      .select({ team: schema.teams })
      .from(schema.teamMemberships)
      .innerJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, schema.teamMemberships.clientOrganizationId),
          eq(schema.teams.id, schema.teamMemberships.teamId),
        ),
      )
      .where(
        and(
          eq(schema.teamMemberships.clientOrganizationId, clientId(context)),
          eq(schema.teamMemberships.membershipId, membershipId),
          isNull(schema.teamMemberships.endedAt),
        ),
      );
    if (rows.some((row) => this.actorCanAccessTeam(context, row.team))) return;
    throw new ForbiddenException({
      code: 'SCOPE_DENIED',
      details: [],
      message: 'The selected membership is outside your management scope.',
      retryable: false,
    });
  }
  private async rejectReportingCycle(
    tx: Tx,
    cid: string,
    subordinateMembershipId: string,
    managerMembershipId: string,
  ): Promise<void> {
    const rows = await tx
      .select({
        managerMembershipId: schema.reportingLines.managerMembershipId,
        subordinateMembershipId: schema.reportingLines.subordinateMembershipId,
      })
      .from(schema.reportingLines)
      .where(
        and(
          eq(schema.reportingLines.clientOrganizationId, cid),
          isNull(schema.reportingLines.endedAt),
        ),
      );
    const managerBySubordinate = new Map(
      rows
        .filter((row) => row.subordinateMembershipId !== subordinateMembershipId)
        .map((row) => [row.subordinateMembershipId, row.managerMembershipId]),
    );
    let cursor: string | undefined = managerMembershipId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === subordinateMembershipId)
        throw conflict('The reporting relationship would create a hierarchy cycle.');
      if (visited.has(cursor)) throw conflict('The existing reporting hierarchy contains a cycle.');
      visited.add(cursor);
      cursor = managerBySubordinate.get(cursor);
    }
  }
  private async assertScopes(
    tx: Tx,
    cid: string,
    branchIds: string[],
    departmentIds: string[],
    teamIds: string[],
  ): Promise<void> {
    if (branchIds.length) {
      const rows = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.clientOrganizationId, cid),
            inArray(schema.branches.id, branchIds),
          ),
        );
      if (rows.length !== new Set(branchIds).size)
        throw conflict('One or more branch scopes are outside the client.');
    }
    if (departmentIds.length) {
      const rows = await tx
        .select({ branchId: schema.departments.branchId, id: schema.departments.id })
        .from(schema.departments)
        .where(
          and(
            eq(schema.departments.clientOrganizationId, cid),
            inArray(schema.departments.id, departmentIds),
          ),
        );
      if (rows.length !== new Set(departmentIds).size)
        throw conflict('One or more department scopes are outside the client.');
      if (
        branchIds.length > 0 &&
        rows.some((department) => !branchIds.includes(department.branchId))
      )
        throw conflict('Department scopes must belong to a selected branch scope.');
    }
    if (teamIds.length) {
      const rows = await tx
        .select({
          branchId: schema.teams.branchId,
          departmentId: schema.teams.departmentId,
          id: schema.teams.id,
        })
        .from(schema.teams)
        .where(and(eq(schema.teams.clientOrganizationId, cid), inArray(schema.teams.id, teamIds)));
      if (rows.length !== new Set(teamIds).size)
        throw conflict('One or more team scopes are outside the client.');
      if (branchIds.length > 0 && rows.some((team) => !branchIds.includes(team.branchId)))
        throw conflict('Team scopes must belong to a selected branch scope.');
      if (
        departmentIds.length > 0 &&
        rows.some((team) => !departmentIds.includes(team.departmentId))
      )
        throw conflict('Team scopes must belong to a selected department scope.');
    }
  }
  private async insertScopes(
    tx: Tx,
    cid: string,
    membershipId: string,
    branchIds: string[],
    departmentIds: string[],
    teamIds: string[],
  ): Promise<void> {
    if (branchIds.length)
      await tx
        .insert(schema.membershipBranchScopes)
        .values(
          branchIds.map((branchId) => ({ clientOrganizationId: cid, membershipId, branchId })),
        );
    if (departmentIds.length) {
      const rows = await tx
        .select({ branchId: schema.departments.branchId, id: schema.departments.id })
        .from(schema.departments)
        .where(inArray(schema.departments.id, departmentIds));
      await tx.insert(schema.membershipDepartmentScopes).values(
        rows.map((department) => ({
          branchId: department.branchId,
          clientOrganizationId: cid,
          departmentId: department.id,
          membershipId,
        })),
      );
    }
    if (teamIds.length) {
      const rows = await tx
        .select({ branchId: schema.teams.branchId, id: schema.teams.id })
        .from(schema.teams)
        .where(inArray(schema.teams.id, teamIds));
      await tx.insert(schema.membershipTeamScopes).values(
        rows.map((team) => ({
          clientOrganizationId: cid,
          membershipId,
          branchId: team.branchId,
          teamId: team.id,
        })),
      );
    }
  }
  private async membershipForUpdate(tx: Tx, cid: string, membershipId: string) {
    const [row] = await tx
      .select({ membership: schema.memberships, user: schema.users, roleCode: schema.roles.code })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.clientOrganizationId, cid),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) throw notFound('The client membership was not found.');
    const [branchScopes, departmentScopes, teamScopes] = await Promise.all([
      tx
        .select({ branchId: schema.membershipBranchScopes.branchId })
        .from(schema.membershipBranchScopes)
        .where(
          and(
            eq(schema.membershipBranchScopes.clientOrganizationId, cid),
            eq(schema.membershipBranchScopes.membershipId, membershipId),
          ),
        ),
      tx
        .select({ departmentId: schema.membershipDepartmentScopes.departmentId })
        .from(schema.membershipDepartmentScopes)
        .where(
          and(
            eq(schema.membershipDepartmentScopes.clientOrganizationId, cid),
            eq(schema.membershipDepartmentScopes.membershipId, membershipId),
          ),
        ),
      tx
        .select({ teamId: schema.membershipTeamScopes.teamId })
        .from(schema.membershipTeamScopes)
        .where(
          and(
            eq(schema.membershipTeamScopes.clientOrganizationId, cid),
            eq(schema.membershipTeamScopes.membershipId, membershipId),
          ),
        ),
    ]);
    return {
      ...row.membership,
      roleCode: row.roleCode,
      user: row.user,
      branchIds: branchScopes.map((scope) => scope.branchId),
      departmentIds: departmentScopes.map((scope) => scope.departmentId),
      teamIds: teamScopes.map((scope) => scope.teamId),
    };
  }
  private async ensureClientAdmin(
    tx: Tx,
    cid: string,
    oldRole: string,
    newRole: string,
    newStatus: string,
  ) {
    if (oldRole !== 'CLIENT_ADMIN' || (newRole === 'CLIENT_ADMIN' && newStatus === 'ACTIVE'))
      return;
    const rows = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.status, 'ACTIVE'),
          eq(schema.roles.code, 'CLIENT_ADMIN'),
        ),
      )
      .for('update');
    if (rows.length <= 1)
      throw conflict('At least one active Client Admin must remain for an active client.');
  }
  private presentMembership(
    membership: typeof schema.memberships.$inferSelect,
    user: typeof schema.users.$inferSelect,
    roleCode: string,
    branchIds: string[],
    departmentIds: string[],
    teamIds: string[],
  ) {
    return {
      user: {
        user_id: user.id,
        display_name: user.displayName,
        email: user.primaryEmailNormalized,
        user_status: user.status,
        membership_id: membership.id,
        membership_status: membership.status,
        role_code: roleCode,
        branch_scope_mode: membership.branchScopeMode,
        branch_ids: branchIds,
        department_scope_mode: membership.departmentScopeMode,
        department_ids: departmentIds,
        job_title: membership.jobTitle,
        team_scope_mode: membership.teamScopeMode,
        team_ids: teamIds,
        assignment_scope: membership.assignmentScope,
      },
      invitation_delivery: 'UNAVAILABLE' as const,
    };
  }
}
