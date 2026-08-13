import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  AnalyticsAttentionItem,
  AnalyticsMetric,
  AnalyticsOverviewResponse,
  AnalyticsPlatformResponse,
  AnalyticsQuery,
  AnalyticsSeries,
  PermissionCode,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';

type Counts = Record<string, number>;

interface RangeBounds {
  end: Date;
  from: string;
  start: Date;
  to: string;
}

interface Snapshot {
  bookings: Counts;
  calls: Counts;
  conversations: Counts;
  deliveries: Counts;
  finance: Counts;
  insurance: Counts;
  inventory: Counts;
  leads: Counts;
  registrations: Counts;
  reminders: Counts;
  rides: Counts;
}

const ACTIVE_LEAD_STATUSES = [
  'NEW',
  'PENDING_REVIEW',
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

function bad(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    details: [],
    message,
    retryable: false,
  });
}

function denied(message: string): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    details: [],
    message,
    retryable: false,
  });
}

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId) throw denied('An active client context is required.');
  return context.clientOrganizationId;
}

function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateText(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00.000Z`).getTime() - new Date(`${from}T12:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

function dateSeries(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function previousRange(query: AnalyticsQuery): { from: string; to: string } | null {
  if (query.compare === 'NONE') return null;
  if (query.compare === 'PREVIOUS_YEAR') {
    return {
      from: `${String(Number(query.from.slice(0, 4)) - 1)}${query.from.slice(4)}`,
      to: `${String(Number(query.to.slice(0, 4)) - 1)}${query.to.slice(4)}`,
    };
  }
  if (query.compare === 'PREVIOUS_MONTH') {
    const first = new Date(`${query.from.slice(0, 7)}-01T12:00:00.000Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const from = dateText(first);
    const end = new Date(first);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return { from, to: dateText(end) };
  }
  const length = daysBetween(query.from, query.to) + 1;
  return { from: addDays(query.from, -length), to: addDays(query.from, -1) };
}

function nextDate(value: string): string {
  return addDays(value, 1);
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
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((entry) => entry.type === type)?.value ?? 0);
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

function bounds(from: string, to: string, timezone: string): RangeBounds {
  if (from > to) throw bad('from must not be later than to.');
  return {
    end: zoneStart(nextDate(to), timezone),
    from,
    start: zoneStart(from, timezone),
    to,
  };
}

function sum(counts: Counts): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

function grouped(rows: { key: string; value: number }[]): Counts {
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.value)]));
}

function comparison(
  current: number,
  previous: number,
  kind: 'PERCENT_CHANGE' | 'PERCENTAGE_POINTS',
): NonNullable<AnalyticsMetric['comparison']> {
  return {
    absolute_change: Number((current - previous).toFixed(1)),
    change_kind: kind,
    previous_value: previous,
    value:
      kind === 'PERCENTAGE_POINTS'
        ? Number((current - previous).toFixed(1))
        : previous === 0
          ? null
          : Number((((current - previous) / previous) * 100).toFixed(1)),
  } as const;
}

function metric(
  code: string,
  label: string,
  value: number,
  previous: number | null,
  options: {
    definition: string;
    direction?: AnalyticsMetric['direction'];
    drilldown?: AnalyticsMetric['drilldown'];
    unit?: AnalyticsMetric['unit'];
    rate?: boolean;
  },
): AnalyticsMetric {
  return {
    code,
    comparison:
      previous === null
        ? null
        : comparison(value, previous, options.rate ? 'PERCENTAGE_POINTS' : 'PERCENT_CHANGE'),
    definition: options.definition,
    direction: options.direction ?? 'NEUTRAL',
    drilldown: options.drilldown ?? 'RECORD_DRILLDOWN',
    label,
    state: 'AVAILABLE',
    unit: options.unit ?? 'COUNT',
    value,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
  ) {}

  async overview(
    context: AuthorizationContext,
    query: AnalyticsQuery,
  ): Promise<AnalyticsOverviewResponse> {
    const tenantTimezone = await this.tenantTimezone(context);
    const effectiveQuery = { ...query, timezone: tenantTimezone };
    await this.assertFilters(context, effectiveQuery);
    const currentRange = bounds(effectiveQuery.from, effectiveQuery.to, tenantTimezone);
    const previous = previousRange(effectiveQuery);
    const previousBounds = previous ? bounds(previous.from, previous.to, tenantTimezone) : null;
    const [current, prior, trend, sources, organization] = await Promise.all([
      this.snapshot(context, effectiveQuery, currentRange),
      previousBounds
        ? this.snapshot(context, effectiveQuery, previousBounds)
        : Promise.resolve<Snapshot | null>(null),
      this.leadTrend(context, effectiveQuery, currentRange),
      this.leadSources(context, effectiveQuery, currentRange),
      this.organizationSnapshot(context),
    ]);

    const can = (permission: PermissionCode): boolean => context.permissionCodes.has(permission);
    const leadTotal = sum(current.leads);
    const priorLeadTotal = prior ? sum(prior.leads) : null;
    const bookings = sum(current.bookings);
    const priorBookings = prior ? sum(prior.bookings) : null;
    const deliveries = current.deliveries.DELIVERED ?? 0;
    const priorDeliveries = prior?.deliveries.DELIVERED ?? null;
    const bookingRate = rate(bookings, leadTotal);
    const priorBookingRate = prior ? rate(sum(prior.bookings), sum(prior.leads)) : null;
    const metrics: AnalyticsMetric[] = [];

    if (can('leads.read')) {
      metrics.push(
        metric(
          'lead_count',
          context.roleCode === 'SALESPERSON' ? 'My Leads' : 'Leads',
          leadTotal,
          priorLeadTotal,
          {
            definition: 'Distinct Lead opportunities captured in the selected tenant-local period.',
          },
        ),
        metric(
          'active_pipeline',
          'Active pipeline',
          ACTIVE_LEAD_STATUSES.reduce((total, status) => total + (current.leads[status] ?? 0), 0),
          prior
            ? ACTIVE_LEAD_STATUSES.reduce((total, status) => total + (prior.leads[status] ?? 0), 0)
            : null,
          { definition: 'Leads in a non-terminal sales status during the selected cohort.' },
        ),
      );
    }
    if (can('commercial.bookings.read')) {
      metrics.push(
        metric('booking_count', 'Bookings', bookings, priorBookings, {
          definition: 'Bookings created in the selected period and visible to the effective scope.',
        }),
      );
      if (can('leads.read'))
        metrics.push(
          metric('lead_to_booking_rate', 'Lead to booking', bookingRate, priorBookingRate, {
            definition: 'Bookings created divided by Leads captured in the same selected period.',
            direction: 'HIGHER_IS_BETTER',
            unit: 'PERCENT',
            rate: true,
          }),
        );
    }
    if (can('delivery.jobs.read'))
      metrics.push(
        metric('delivered_count', 'Delivered', deliveries, priorDeliveries, {
          definition: 'Delivery jobs completed in the selected schedule period.',
          direction: 'HIGHER_IS_BETTER',
        }),
      );
    if (can('telephony.calls.read')) {
      const calls = sum(current.calls);
      metrics.push(
        metric('call_count', 'Calls', calls, prior ? sum(prior.calls) : null, {
          definition: 'Canonical call records created in the selected period.',
        }),
        metric(
          'call_connection_rate',
          'Call connection',
          rate(current.calls.COMPLETED ?? 0, calls),
          prior ? rate(prior.calls.COMPLETED ?? 0, sum(prior.calls)) : null,
          {
            definition: 'Completed canonical calls divided by all calls in the period.',
            direction: 'HIGHER_IS_BETTER',
            unit: 'PERCENT',
            rate: true,
          },
        ),
      );
    }
    if (can('messaging.conversations.read')) {
      const conversations = sum(current.conversations);
      metrics.push(
        metric(
          'conversation_count',
          'Conversations',
          conversations,
          prior ? sum(prior.conversations) : null,
          { definition: 'Canonical conversations created in the selected period and channel.' },
        ),
        metric(
          'conversation_backlog',
          'Conversation backlog',
          (current.conversations.OPEN ?? 0) + (current.conversations.PENDING ?? 0),
          prior ? (prior.conversations.OPEN ?? 0) + (prior.conversations.PENDING ?? 0) : null,
          {
            definition:
              'Open and pending conversations created in the selected period and channel.',
            direction: 'LOWER_IS_BETTER',
          },
        ),
      );
    }
    if (can('test_rides.read'))
      metrics.push(
        metric(
          'test_ride_count',
          'Test rides',
          sum(current.rides),
          prior ? sum(prior.rides) : null,
          {
            definition: 'Test-ride jobs scheduled in the selected period.',
          },
        ),
        metric(
          'test_ride_completion_rate',
          'Ride completion',
          rate(current.rides.COMPLETED ?? 0, sum(current.rides)),
          prior ? rate(prior.rides.COMPLETED ?? 0, sum(prior.rides)) : null,
          {
            definition:
              'Completed test rides divided by all test rides scheduled in the selected period.',
            direction: 'HIGHER_IS_BETTER',
            unit: 'PERCENT',
            rate: true,
          },
        ),
      );
    if (can('inventory.units.read'))
      metrics.push(
        metric('available_inventory', 'Available stock', current.inventory.AVAILABLE ?? 0, null, {
          definition: 'Physical inventory units currently in Available state.',
          drilldown: 'RECORD_DRILLDOWN',
        }),
      );
    if (can('registration.cases.read'))
      metrics.push(
        metric(
          'registration_backlog',
          'Registration backlog',
          sum(current.registrations) - (current.registrations.CLOSED ?? 0),
          prior ? sum(prior.registrations) - (prior.registrations.CLOSED ?? 0) : null,
          {
            definition: 'Registration cases in the period that are not Closed.',
            direction: 'LOWER_IS_BETTER',
          },
        ),
      );

    if (can('commercial.finance.manage')) {
      const financeTotal = sum(current.finance);
      metrics.push(
        metric(
          'finance_applications',
          'Finance applications',
          financeTotal,
          prior ? sum(prior.finance) : null,
          {
            definition:
              'Finance cases created in the selected period and visible to the effective scope.',
          },
        ),
        metric(
          'finance_approval_rate',
          'Finance approval',
          rate((current.finance.APPROVED ?? 0) + (current.finance.DISBURSED ?? 0), financeTotal),
          prior
            ? rate(
                (prior.finance.APPROVED ?? 0) + (prior.finance.DISBURSED ?? 0),
                sum(prior.finance),
              )
            : null,
          {
            definition:
              'Approved or disbursed finance cases divided by finance applications in the period.',
            direction: 'HIGHER_IS_BETTER',
            unit: 'PERCENT',
            rate: true,
          },
        ),
      );
    }

    if (can('commercial.insurance.manage')) {
      const insuranceTotal = sum(current.insurance);
      metrics.push(
        metric(
          'insurance_cases',
          'Insurance cases',
          insuranceTotal,
          prior ? sum(prior.insurance) : null,
          {
            definition:
              'Insurance cases created in the selected period and visible to the effective scope.',
          },
        ),
        metric(
          'insurance_issuance_rate',
          'Policy issuance',
          rate(current.insurance.ISSUED ?? 0, insuranceTotal),
          prior ? rate(prior.insurance.ISSUED ?? 0, sum(prior.insurance)) : null,
          {
            definition:
              'Cases with a generated policy divided by insurance cases in the selected period.',
            direction: 'HIGHER_IS_BETTER',
            unit: 'PERCENT',
            rate: true,
          },
        ),
      );
    }

    const attention = await this.attention(context, effectiveQuery, currentRange);
    const series: AnalyticsSeries[] = [];
    if (can('leads.read')) {
      series.push({
        code: 'lead_trend',
        dataset: trend,
        description: 'Lead volume by tenant-local capture date.',
        drilldown: 'RECORD_DRILLDOWN',
        label: 'Lead trend',
        type: 'LINE',
        unit: 'COUNT',
      });
      series.push({
        code: 'lead_funnel',
        dataset: Object.entries(current.leads).map(([category, value]) => ({ category, value })),
        description: 'Current Lead status composition for the selected cohort.',
        drilldown: 'RECORD_DRILLDOWN',
        label: 'Sales funnel',
        type: 'FUNNEL',
        unit: 'COUNT',
      });
      series.push({
        code: 'source_distribution',
        dataset: sources,
        description: 'Lead count by original canonical source.',
        drilldown: 'RECORD_DRILLDOWN',
        label: 'Lead sources',
        type: 'BAR',
        unit: 'COUNT',
      });
    }
    if (can('test_rides.read'))
      series.push(this.statusSeries('test_ride_status', 'Test ride status', current.rides));
    if (can('messaging.conversations.read'))
      series.push(
        this.statusSeries('conversation_status', 'Conversation status', current.conversations),
      );
    if (can('inventory.units.read'))
      series.push(this.statusSeries('inventory_status', 'Inventory status', current.inventory));
    if (can('delivery.jobs.read'))
      series.push(this.statusSeries('delivery_status', 'Delivery status', current.deliveries));
    if (can('registration.cases.read'))
      series.push(
        this.statusSeries('registration_status', 'Registration status', current.registrations),
      );
    if (can('commercial.finance.manage'))
      series.push(this.statusSeries('finance_status', 'Finance status', current.finance));
    if (can('commercial.insurance.manage'))
      series.push(this.statusSeries('insurance_status', 'Insurance status', current.insurance));

    if (context.roleCode === 'CLIENT_ADMIN' || context.roleCode === 'MANAGER') {
      metrics.unshift(
        metric('active_users', 'Active users', organization.activeUsers, null, {
          definition: 'Active tenant memberships at generation time.',
          drilldown: 'NO_DRILLDOWN',
        }),
      );
    }

    return {
      attention,
      available_dimensions: ['BRANCH', 'DEPARTMENT', 'TEAM', 'USER', 'SOURCE', 'MODEL', 'CHANNEL'],
      freshness: { generated_at: new Date().toISOString(), mode: 'NEAR_REAL_TIME' },
      metrics: this.roleMetrics(context.roleCode, metrics),
      range: {
        compare_from: previous?.from ?? null,
        compare_to: previous?.to ?? null,
        from: effectiveQuery.from,
        timezone: tenantTimezone,
        to: effectiveQuery.to,
      },
      role: context.roleCode,
      scope: this.scope(context),
      series: this.roleSeries(context.roleCode, series),
    };
  }

  async platform(
    context: AuthorizationContext,
    query: AnalyticsQuery,
  ): Promise<AnalyticsPlatformResponse> {
    if (!context.agencyId || context.clientOrganizationId)
      throw denied('Agency platform analytics require a platform context.');
    if (
      query.branch_id ||
      query.department_id ||
      query.team_id ||
      query.user_id ||
      query.source ||
      query.model ||
      query.channel
    )
      throw denied('Platform analytics accept aggregate date filters only.');

    const range = bounds(query.from, query.to, query.timezone);
    const previous = previousRange(query);
    const priorRange = previous ? bounds(previous.from, previous.to, query.timezone) : null;
    const clients = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(eq(schema.clientOrganizations.agencyId, context.agencyId))
      .orderBy(asc(schema.clientOrganizations.displayName));
    const ids = clients.map((client) => client.id);
    const empty = ids.length === 0;
    const [
      leadRows,
      bookingRows,
      deliveryRows,
      priorLeadRows,
      priorBookingRows,
      priorDeliveryRows,
      branchRows,
      userRows,
      moduleRows,
      integrationRows,
      leadTrendRows,
    ] = empty
      ? [[], [], [], [], [], [], [], [], [], [], []]
      : await Promise.all([
          this.connection.db
            .select({
              clientId: schema.leadOpportunities.clientOrganizationId,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.leadOpportunities)
            .where(
              and(
                inArray(schema.leadOpportunities.clientOrganizationId, ids),
                gte(schema.leadOpportunities.capturedAt, range.start),
                lt(schema.leadOpportunities.capturedAt, range.end),
              ),
            )
            .groupBy(schema.leadOpportunities.clientOrganizationId),
          this.connection.db
            .select({
              clientId: schema.bookings.clientOrganizationId,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.bookings)
            .where(
              and(
                inArray(schema.bookings.clientOrganizationId, ids),
                gte(schema.bookings.createdAt, range.start),
                lt(schema.bookings.createdAt, range.end),
              ),
            )
            .groupBy(schema.bookings.clientOrganizationId),
          this.connection.db
            .select({
              clientId: schema.deliveryJobs.clientOrganizationId,
              value: sql<number>`count(*) filter (where ${schema.deliveryJobs.status} = 'DELIVERED')::integer`,
            })
            .from(schema.deliveryJobs)
            .where(
              and(
                inArray(schema.deliveryJobs.clientOrganizationId, ids),
                gte(schema.deliveryJobs.scheduledFor, range.start),
                lt(schema.deliveryJobs.scheduledFor, range.end),
              ),
            )
            .groupBy(schema.deliveryJobs.clientOrganizationId),
          priorRange
            ? this.connection.db
                .select({ value: sql<number>`count(*)::integer` })
                .from(schema.leadOpportunities)
                .where(
                  and(
                    inArray(schema.leadOpportunities.clientOrganizationId, ids),
                    gte(schema.leadOpportunities.capturedAt, priorRange.start),
                    lt(schema.leadOpportunities.capturedAt, priorRange.end),
                  ),
                )
            : Promise.resolve([]),
          priorRange
            ? this.connection.db
                .select({ value: sql<number>`count(*)::integer` })
                .from(schema.bookings)
                .where(
                  and(
                    inArray(schema.bookings.clientOrganizationId, ids),
                    gte(schema.bookings.createdAt, priorRange.start),
                    lt(schema.bookings.createdAt, priorRange.end),
                  ),
                )
            : Promise.resolve([]),
          priorRange
            ? this.connection.db
                .select({
                  value: sql<number>`count(*) filter (where ${schema.deliveryJobs.status} = 'DELIVERED')::integer`,
                })
                .from(schema.deliveryJobs)
                .where(
                  and(
                    inArray(schema.deliveryJobs.clientOrganizationId, ids),
                    gte(schema.deliveryJobs.scheduledFor, priorRange.start),
                    lt(schema.deliveryJobs.scheduledFor, priorRange.end),
                  ),
                )
            : Promise.resolve([]),
          this.connection.db
            .select({
              clientId: schema.branches.clientOrganizationId,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.branches)
            .where(inArray(schema.branches.clientOrganizationId, ids))
            .groupBy(schema.branches.clientOrganizationId),
          this.connection.db
            .select({
              active: sql<number>`count(*) filter (where ${schema.memberships.status} = 'ACTIVE')::integer`,
              clientId: schema.memberships.clientOrganizationId,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.memberships)
            .where(inArray(schema.memberships.clientOrganizationId, ids))
            .groupBy(schema.memberships.clientOrganizationId),
          this.connection.db
            .select({
              clientId: schema.clientModuleFlags.clientOrganizationId,
              value: sql<number>`count(*) filter (where ${schema.clientModuleFlags.enabled})::integer`,
            })
            .from(schema.clientModuleFlags)
            .where(inArray(schema.clientModuleFlags.clientOrganizationId, ids))
            .groupBy(schema.clientModuleFlags.clientOrganizationId),
          this.connection.db
            .select({
              clientId: schema.clientIntegrationReadiness.clientOrganizationId,
              degraded: sql<number>`count(*) filter (where ${schema.clientIntegrationReadiness.status} not in ('ACTIVE', 'NOT_CONNECTED'))::integer`,
              total: sql<number>`count(*) filter (where ${schema.clientIntegrationReadiness.status} <> 'NOT_CONNECTED')::integer`,
            })
            .from(schema.clientIntegrationReadiness)
            .where(inArray(schema.clientIntegrationReadiness.clientOrganizationId, ids))
            .groupBy(schema.clientIntegrationReadiness.clientOrganizationId),
          this.connection.db
            .select({
              category: sql<string>`to_char(${schema.leadOpportunities.capturedAt} at time zone ${query.timezone}, 'YYYY-MM-DD')`,
              clientId: schema.leadOpportunities.clientOrganizationId,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.leadOpportunities)
            .where(
              and(
                inArray(schema.leadOpportunities.clientOrganizationId, ids),
                gte(schema.leadOpportunities.capturedAt, range.start),
                lt(schema.leadOpportunities.capturedAt, range.end),
              ),
            )
            .groupBy(sql`1`, schema.leadOpportunities.clientOrganizationId)
            .orderBy(sql`1`),
        ]);
    const map = <T extends { clientId: string | null }>(rows: T[]): Map<string, T> =>
      new Map(
        rows
          .filter((row): row is T & { clientId: string } => row.clientId !== null)
          .map((row) => [row.clientId, row]),
      );
    const leads = map(leadRows);
    const bookings = map(bookingRows);
    const deliveries = map(deliveryRows);
    const branches = map(branchRows);
    const users = map(userRows);
    const modules = map(moduleRows);
    const integrations = map(integrationRows);
    const trendCategories = dateSeries(query.from, query.to);
    const trendByClient = new Map<string, number[]>(
      clients.map((client) => [client.id, trendCategories.map(() => 0)]),
    );
    for (const row of leadTrendRows) {
      if (!row.clientId) continue;
      const values = trendByClient.get(row.clientId);
      const index = trendCategories.indexOf(row.category);
      if (values && index !== -1) values[index] = Number(row.value);
    }
    const leadTrend = {
      categories: trendCategories,
      series: clients.map((client) => ({
        client_id: client.id,
        client_name: client.displayName,
        values: trendByClient.get(client.id) ?? trendCategories.map(() => 0),
      })),
    };
    const clientData = clients.map((client) => {
      const leadCount = Number(leads.get(client.id)?.value ?? 0);
      const bookingCount = Number(bookings.get(client.id)?.value ?? 0);
      const deliveryCount = Number(deliveries.get(client.id)?.value ?? 0);
      const integration = integrations.get(client.id);
      return {
        active_users: Number(users.get(client.id)?.active ?? 0),
        bookings: bookingCount,
        branches: Number(branches.get(client.id)?.value ?? 0),
        booking_to_delivery_rate: rate(deliveryCount, bookingCount),
        client_id: client.id,
        client_name: client.displayName,
        deliveries: deliveryCount,
        integration_health:
          Number(integration?.total ?? 0) === 0
            ? ('NOT_CONFIGURED' as const)
            : Number(integration?.degraded ?? 0) > 0
              ? ('DEGRADED' as const)
              : ('HEALTHY' as const),
        lead_to_booking_rate: rate(bookingCount, leadCount),
        leads: leadCount,
        modules_enabled: Number(modules.get(client.id)?.value ?? 0),
        status: client.status,
        users: Number(users.get(client.id)?.value ?? 0),
      };
    });
    const totalLeads = clientData.reduce((total, item) => total + item.leads, 0);
    const totalBookings = clientData.reduce((total, item) => total + item.bookings, 0);
    const totalDeliveries = clientData.reduce((total, item) => total + item.deliveries, 0);
    const totalActiveUsers = clientData.reduce((total, item) => total + item.active_users, 0);
    const priorLeads = priorRange ? Number(priorLeadRows[0]?.value ?? 0) : null;
    const priorBookings = priorRange ? Number(priorBookingRows[0]?.value ?? 0) : null;
    const priorDeliveries = priorRange ? Number(priorDeliveryRows[0]?.value ?? 0) : null;
    const metrics = [
      metric('platform_clients', 'Clients', clients.length, null, {
        definition: 'Client organizations in the active agency.',
        drilldown: 'AGGREGATE_DRILLDOWN',
      }),
      metric(
        'active_clients',
        'Active clients',
        clients.filter((client) => client.status === 'ACTIVE').length,
        null,
        {
          definition: 'Client organizations currently in Active state.',
          drilldown: 'AGGREGATE_DRILLDOWN',
        },
      ),
      metric('platform_leads', 'Aggregate Leads', totalLeads, priorLeads, {
        definition:
          'Lead count across agency clients for the selected period; no Lead rows or PII are returned.',
        drilldown: 'AGGREGATE_DRILLDOWN',
      }),
      metric('platform_bookings', 'Aggregate bookings', totalBookings, priorBookings, {
        definition: 'Booking count across agency clients for the selected period.',
        drilldown: 'AGGREGATE_DRILLDOWN',
      }),
      metric('platform_deliveries', 'Aggregate deliveries', totalDeliveries, priorDeliveries, {
        definition: 'Delivered job count across agency clients for the selected period.',
        drilldown: 'AGGREGATE_DRILLDOWN',
      }),
      metric(
        'platform_conversion',
        'Lead to booking',
        rate(totalBookings, totalLeads),
        priorLeads === null || priorBookings === null ? null : rate(priorBookings, priorLeads),
        {
          definition: 'Aggregate bookings divided by aggregate Leads for the same selected period.',
          drilldown: 'AGGREGATE_DRILLDOWN',
          unit: 'PERCENT',
          rate: true,
        },
      ),
      metric(
        'platform_booking_to_delivery',
        'Booking to delivery',
        rate(totalDeliveries, totalBookings),
        priorBookings === null || priorDeliveries === null
          ? null
          : rate(priorDeliveries, priorBookings),
        {
          definition:
            'Aggregate delivered jobs divided by aggregate bookings for the same selected period.',
          direction: 'HIGHER_IS_BETTER',
          drilldown: 'AGGREGATE_DRILLDOWN',
          unit: 'PERCENT',
          rate: true,
        },
      ),
      metric('platform_active_users', 'Active client users', totalActiveUsers, null, {
        definition:
          'Active memberships across agency clients at generation time; this is a current-state measure.',
        drilldown: 'AGGREGATE_DRILLDOWN',
      }),
    ];
    return {
      attention: clientData
        .filter((client) => client.integration_health === 'DEGRADED')
        .map((client) => ({
          code: `integration:${client.client_id}`,
          count: 1,
          drilldown: 'AGGREGATE_DRILLDOWN' as const,
          href: null,
          label: `${client.client_name} integration health needs attention`,
          severity: 'WARNING' as const,
        })),
      available_dimensions: [],
      clients: clientData,
      freshness: { generated_at: new Date().toISOString(), mode: 'NEAR_REAL_TIME' },
      lead_trend: leadTrend,
      metrics,
      range: {
        compare_from: previous?.from ?? null,
        compare_to: previous?.to ?? null,
        from: query.from,
        timezone: query.timezone,
        to: query.to,
      },
      role: 'AGENCY_ADMIN',
      scope: 'PLATFORM_AGGREGATE',
      series: [
        {
          code: 'client_lead_volume',
          dataset: clientData.map((client) => ({
            category: client.client_name,
            value: client.leads,
          })),
          description:
            'Aggregate Lead volume by client; tooltips contain no customer or Lead-level data.',
          drilldown: 'AGGREGATE_DRILLDOWN',
          label: 'Lead volume by client',
          type: 'BAR',
          unit: 'COUNT',
        },
        {
          code: 'client_conversion',
          dataset: clientData.map((client) => ({
            category: client.client_name,
            value: client.lead_to_booking_rate,
          })),
          description: 'Lead-to-booking conversion by client.',
          drilldown: 'AGGREGATE_DRILLDOWN',
          label: 'Client conversion',
          type: 'BAR',
          unit: 'PERCENT',
        },
      ],
    };
  }

  private async snapshot(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    range: RangeBounds,
  ): Promise<Snapshot> {
    const cid = clientId(context);
    const leadAccess = this.leadAccess(context, query);
    const leadRange = and(
      leadAccess,
      gte(schema.leadOpportunities.capturedAt, range.start),
      lt(schema.leadOpportunities.capturedAt, range.end),
    );
    const can = (permission: PermissionCode): boolean => context.permissionCodes.has(permission);
    const empty: { key: string; value: number }[] = [];
    const [
      leadRows,
      callRows,
      conversationRows,
      rideRows,
      inventoryRows,
      bookingRows,
      deliveryRows,
      registrationRows,
      reminderRows,
      financeRows,
      insuranceRows,
    ] = await Promise.all([
      can('leads.read')
        ? this.connection.db
            .select({ key: schema.leadOpportunities.status, value: sql<number>`count(*)::integer` })
            .from(schema.leadOpportunities)
            .leftJoin(
              schema.assignmentQueues,
              and(
                eq(schema.assignmentQueues.clientOrganizationId, cid),
                eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
              ),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(leadRange)
            .groupBy(schema.leadOpportunities.status)
        : empty,
      can('telephony.calls.read')
        ? this.connection.db
            .select({ key: schema.calls.status, value: sql<number>`count(*)::integer` })
            .from(schema.calls)
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.calls.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.calls.clientOrganizationId, cid),
                leadAccess,
                gte(schema.calls.createdAt, range.start),
                lt(schema.calls.createdAt, range.end),
              ),
            )
            .groupBy(schema.calls.status)
        : empty,
      can('messaging.conversations.read')
        ? this.connection.db
            .select({ key: schema.conversations.status, value: sql<number>`count(*)::integer` })
            .from(schema.conversations)
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.conversations.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.conversations.clientOrganizationId, cid),
                leadAccess,
                query.channel ? eq(schema.conversations.channel, query.channel) : undefined,
                gte(schema.conversations.createdAt, range.start),
                lt(schema.conversations.createdAt, range.end),
              ),
            )
            .groupBy(schema.conversations.status)
        : empty,
      can('test_rides.read')
        ? this.connection.db
            .select({ key: schema.testRideJobs.status, value: sql<number>`count(*)::integer` })
            .from(schema.testRideJobs)
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.testRideJobs.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.testRideJobs.clientOrganizationId, cid),
                context.roleCode === 'TEST_RIDE_EXECUTIVE'
                  ? eq(schema.testRideJobs.executiveUserId, context.userId)
                  : leadAccess,
                gte(schema.testRideJobs.scheduledStartAt, range.start),
                lt(schema.testRideJobs.scheduledStartAt, range.end),
              ),
            )
            .groupBy(schema.testRideJobs.status)
        : empty,
      can('inventory.units.read')
        ? this.connection.db
            .select({ key: schema.inventoryUnits.status, value: sql<number>`count(*)::integer` })
            .from(schema.inventoryUnits)
            .innerJoin(
              schema.inventoryVariants,
              eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
            )
            .innerJoin(
              schema.inventoryModels,
              eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
            )
            .where(
              and(
                eq(schema.inventoryUnits.clientOrganizationId, cid),
                this.branchAccess(context, query, schema.inventoryUnits.branchId),
                query.model ? ilike(schema.inventoryModels.name, `%${query.model}%`) : undefined,
              ),
            )
            .groupBy(schema.inventoryUnits.status)
        : empty,
      can('commercial.bookings.read')
        ? this.connection.db
            .select({ key: schema.bookings.status, value: sql<number>`count(*)::integer` })
            .from(schema.bookings)
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.bookings.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.bookings.clientOrganizationId, cid),
                leadAccess,
                gte(schema.bookings.createdAt, range.start),
                lt(schema.bookings.createdAt, range.end),
              ),
            )
            .groupBy(schema.bookings.status)
        : empty,
      can('delivery.jobs.read')
        ? this.connection.db
            .select({ key: schema.deliveryJobs.status, value: sql<number>`count(*)::integer` })
            .from(schema.deliveryJobs)
            .where(
              and(
                eq(schema.deliveryJobs.clientOrganizationId, cid),
                this.domainAccess(
                  context,
                  query,
                  schema.deliveryJobs.branchId,
                  schema.deliveryJobs.assignedUserId,
                ),
                gte(schema.deliveryJobs.scheduledFor, range.start),
                lt(schema.deliveryJobs.scheduledFor, range.end),
              ),
            )
            .groupBy(schema.deliveryJobs.status)
        : empty,
      can('registration.cases.read')
        ? this.connection.db
            .select({ key: schema.registrationCases.status, value: sql<number>`count(*)::integer` })
            .from(schema.registrationCases)
            .where(
              and(
                eq(schema.registrationCases.clientOrganizationId, cid),
                this.domainAccess(
                  context,
                  query,
                  schema.registrationCases.branchId,
                  schema.registrationCases.assignedUserId,
                ),
                gte(schema.registrationCases.createdAt, range.start),
                lt(schema.registrationCases.createdAt, range.end),
              ),
            )
            .groupBy(schema.registrationCases.status)
        : empty,
      can('reminders.read')
        ? this.connection.db
            .select({ key: schema.reminderInstances.status, value: sql<number>`count(*)::integer` })
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
                eq(schema.reminderInstances.clientOrganizationId, cid),
                this.branchAccess(context, query, schema.customerVehicles.branchId),
                gte(schema.reminderInstances.scheduledFor, range.start),
                lt(schema.reminderInstances.scheduledFor, range.end),
              ),
            )
            .groupBy(schema.reminderInstances.status)
        : empty,
      can('commercial.finance.manage')
        ? this.connection.db
            .select({ key: schema.financeCases.status, value: sql<number>`count(*)::integer` })
            .from(schema.financeCases)
            .innerJoin(schema.bookings, eq(schema.bookings.id, schema.financeCases.bookingId))
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.bookings.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.financeCases.clientOrganizationId, cid),
                leadAccess,
                gte(schema.financeCases.createdAt, range.start),
                lt(schema.financeCases.createdAt, range.end),
              ),
            )
            .groupBy(schema.financeCases.status)
        : empty,
      can('commercial.insurance.manage')
        ? this.connection.db
            .select({
              key: sql<string>`case when ${schema.insuranceCases.policyGenerated} then 'ISSUED' else 'PENDING' end`,
              value: sql<number>`count(*)::integer`,
            })
            .from(schema.insuranceCases)
            .innerJoin(schema.bookings, eq(schema.bookings.id, schema.insuranceCases.bookingId))
            .innerJoin(
              schema.leadOpportunities,
              eq(schema.leadOpportunities.id, schema.bookings.leadId),
            )
            .leftJoin(
              schema.assignmentQueues,
              eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
            )
            .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
            .where(
              and(
                eq(schema.insuranceCases.clientOrganizationId, cid),
                leadAccess,
                gte(schema.insuranceCases.createdAt, range.start),
                lt(schema.insuranceCases.createdAt, range.end),
              ),
            )
            .groupBy(
              sql`case when ${schema.insuranceCases.policyGenerated} then 'ISSUED' else 'PENDING' end`,
            )
        : empty,
    ]);
    return {
      bookings: grouped(bookingRows),
      calls: grouped(callRows),
      conversations: grouped(conversationRows),
      deliveries: grouped(deliveryRows),
      finance: grouped(financeRows),
      insurance: grouped(insuranceRows),
      inventory: grouped(inventoryRows),
      leads: grouped(leadRows),
      registrations: grouped(registrationRows),
      reminders: grouped(reminderRows),
      rides: grouped(rideRows),
    };
  }

  private async leadTrend(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    range: RangeBounds,
  ): Promise<{ category: string; value: number }[]> {
    if (!context.permissionCodes.has('leads.read')) return [];
    const cid = clientId(context);
    const category = sql<string>`to_char(${schema.leadOpportunities.capturedAt} at time zone ${query.timezone}, 'YYYY-MM-DD')`;
    const rows = await this.connection.db
      .select({ category, value: sql<number>`count(*)::integer` })
      .from(schema.leadOpportunities)
      .leftJoin(
        schema.assignmentQueues,
        eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          this.leadAccess(context, query),
          gte(schema.leadOpportunities.capturedAt, range.start),
          lt(schema.leadOpportunities.capturedAt, range.end),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return rows.map((row) => ({ category: row.category, value: Number(row.value) }));
  }

  private async leadSources(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    range: RangeBounds,
  ): Promise<{ category: string; value: number }[]> {
    if (!context.permissionCodes.has('leads.read')) return [];
    const rows = await this.connection.db
      .select({ category: schema.leadOpportunities.source, value: sql<number>`count(*)::integer` })
      .from(schema.leadOpportunities)
      .leftJoin(
        schema.assignmentQueues,
        eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
      .where(
        and(
          this.leadAccess(context, query),
          gte(schema.leadOpportunities.capturedAt, range.start),
          lt(schema.leadOpportunities.capturedAt, range.end),
        ),
      )
      .groupBy(schema.leadOpportunities.source)
      .orderBy(sql`count(*) desc`);
    return rows.map((row) => ({ category: row.category, value: Number(row.value) }));
  }

  private async attention(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    range: RangeBounds,
  ): Promise<AnalyticsAttentionItem[]> {
    if (!context.permissionCodes.has('leads.read')) return [];
    const cid = clientId(context);
    const access = this.leadAccess(context, query);
    const [row] = await this.connection.db
      .select({
        breached: sql<number>`count(*) filter (where ${schema.leadOpportunities.slaState} = 'BREACHED')::integer`,
        overdue: sql<number>`count(*) filter (where ${schema.leadOpportunities.nextActionAt} < now() and ${schema.leadOpportunities.status} not in ('REJECTED', 'LOST', 'BOOKING_CONFIRMED'))::integer`,
        unassigned: sql<number>`count(*) filter (where ${schema.leadOpportunities.currentProcessOwnerId} is null)::integer`,
      })
      .from(schema.leadOpportunities)
      .leftJoin(
        schema.assignmentQueues,
        eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          access,
          gte(schema.leadOpportunities.capturedAt, range.start),
          lt(schema.leadOpportunities.capturedAt, range.end),
        ),
      );
    const result: AnalyticsAttentionItem[] = [];
    const add = (
      code: string,
      label: string,
      count: number,
      severity: 'WARNING' | 'CRITICAL',
      href: string,
    ): void => {
      if (count > 0)
        result.push({ code, count, drilldown: 'RECORD_DRILLDOWN', href, label, severity });
    };
    add(
      'overdue_followups',
      'Overdue follow-ups',
      Number(row?.overdue ?? 0),
      'WARNING',
      '/leads?sla=ALL',
    );
    add(
      'sla_breaches',
      'SLA breaches',
      Number(row?.breached ?? 0),
      'CRITICAL',
      '/leads?sla=BREACHED',
    );
    add('unassigned_leads', 'Unassigned Leads', Number(row?.unassigned ?? 0), 'WARNING', '/leads');
    return result;
  }

  private async organizationSnapshot(
    context: AuthorizationContext,
  ): Promise<{ activeUsers: number }> {
    if (!context.clientOrganizationId) return { activeUsers: 0 };
    const [row] = await this.connection.db
      .select({ value: sql<number>`count(*)::integer` })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, context.clientOrganizationId),
          eq(schema.memberships.status, 'ACTIVE'),
        ),
      );
    return { activeUsers: Number(row?.value ?? 0) };
  }

  private leadAccess(context: AuthorizationContext, query: AnalyticsQuery): SQL {
    const conditions: (SQL | undefined)[] = [
      eq(schema.leadOpportunities.clientOrganizationId, clientId(context)),
    ];
    conditions.push(this.branchAccess(context, query, schema.leadOpportunities.branchId));
    if (query.source) conditions.push(eq(schema.leadOpportunities.source, query.source));
    if (query.model)
      conditions.push(ilike(schema.leadOpportunities.vehicleInterest, `%${query.model}%`));
    if (query.team_id) conditions.push(eq(schema.teams.id, query.team_id));
    else if (context.roleCode === 'TEAM_MANAGER')
      conditions.push(
        context.managedTeamIds.size
          ? inArray(schema.teams.id, [...context.managedTeamIds])
          : sql`false`,
      );
    else if (context.assignmentScope === 'TEAM') {
      const teams = new Set([...context.teamIds, ...context.managedTeamIds]);
      conditions.push(teams.size ? inArray(schema.teams.id, [...teams]) : sql`false`);
    } else if (context.teamScopeMode === 'SELECTED')
      conditions.push(or(isNull(schema.teams.id), inArray(schema.teams.id, [...context.teamIds])));
    else if (context.teamScopeMode === 'NONE' && context.assignmentScope !== 'ALL')
      conditions.push(sql`false`);
    if (query.department_id) conditions.push(eq(schema.teams.departmentId, query.department_id));
    else if (context.departmentScopeMode === 'SELECTED')
      conditions.push(
        or(
          isNull(schema.teams.departmentId),
          inArray(schema.teams.departmentId, [...context.departmentIds]),
        ),
      );
    else if (context.departmentScopeMode === 'NONE' && context.assignmentScope !== 'ALL')
      conditions.push(sql`false`);
    const requestedUser = query.user_id;
    if (requestedUser)
      conditions.push(eq(schema.leadOpportunities.currentProcessOwnerId, requestedUser));
    else if (context.assignmentScope === 'OWNED')
      conditions.push(eq(schema.leadOpportunities.relationshipOwnerId, context.userId));
    else if (context.assignmentScope === 'ASSIGNED' || context.roleCode === 'SALESPERSON')
      conditions.push(eq(schema.leadOpportunities.currentProcessOwnerId, context.userId));
    else if (context.assignmentScope === 'OWNED_OR_ASSIGNED')
      conditions.push(
        or(
          eq(schema.leadOpportunities.relationshipOwnerId, context.userId),
          eq(schema.leadOpportunities.currentProcessOwnerId, context.userId),
        ),
      );
    else if (context.assignmentScope === 'NONE') conditions.push(sql`false`);
    return and(...conditions) ?? sql`true`;
  }

  private branchAccess(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    column: AnyPgColumn,
  ): SQL {
    if (query.branch_id) return eq(column, query.branch_id);
    if (context.branchScopeMode === 'ALL') return sql`true`;
    if (context.branchScopeMode === 'SELECTED' && context.branchIds.size)
      return inArray(column, [...context.branchIds]);
    return sql`false`;
  }

  private domainAccess(
    context: AuthorizationContext,
    query: AnalyticsQuery,
    branchColumn: AnyPgColumn,
    assigneeColumn: AnyPgColumn,
  ): SQL {
    const conditions: SQL[] = [this.branchAccess(context, query, branchColumn)];
    if (query.user_id) conditions.push(eq(assigneeColumn, query.user_id));
    else if (
      context.assignmentScope === 'ASSIGNED' ||
      context.assignmentScope === 'OWNED' ||
      context.assignmentScope === 'OWNED_OR_ASSIGNED'
    )
      conditions.push(eq(assigneeColumn, context.userId));
    else if (context.assignmentScope === 'NONE') conditions.push(sql`false`);
    return and(...conditions) ?? sql`true`;
  }

  private async assertFilters(context: AuthorizationContext, query: AnalyticsQuery): Promise<void> {
    if (query.branch_id && !this.policy.canAccessBranch(context, query.branch_id))
      throw denied('The requested branch is outside your authorization scope.');
    if (query.team_id && !this.policy.canAccessTeam(context, query.team_id))
      throw denied('The requested team is outside your authorization scope.');
    if (query.department_id && !this.policy.canAccessDepartment(context, query.department_id))
      throw denied('The requested department is outside your authorization scope.');
    if (
      query.user_id &&
      query.user_id !== context.userId &&
      !['CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER'].includes(context.roleCode)
    )
      throw denied('The requested user filter is outside your authorization scope.');
  }

  private async tenantTimezone(context: AuthorizationContext): Promise<string> {
    const cid = clientId(context);
    const [organization] = await this.connection.db
      .select({ timezone: schema.clientOrganizations.timezone })
      .from(schema.clientOrganizations)
      .where(eq(schema.clientOrganizations.id, cid))
      .limit(1);
    if (!organization) throw denied('The active client organization no longer exists.');
    return organization.timezone;
  }

  private statusSeries(code: string, label: string, counts: Counts): AnalyticsSeries {
    return {
      code,
      dataset: Object.entries(counts).map(([category, value]) => ({ category, value })),
      description: `${label} composition for the selected scope and period.`,
      drilldown: 'RECORD_DRILLDOWN',
      label,
      type: 'BAR',
      unit: 'COUNT',
    };
  }

  private scope(context: AuthorizationContext): AnalyticsOverviewResponse['scope'] {
    if (
      context.assignmentScope === 'OWNED' ||
      context.assignmentScope === 'ASSIGNED' ||
      context.assignmentScope === 'OWNED_OR_ASSIGNED'
    )
      return 'OWN';
    if (context.roleCode === 'TEAM_MANAGER' || context.assignmentScope === 'TEAM') return 'TEAM';
    if (context.branchScopeMode === 'SELECTED') return 'BRANCH';
    return 'TENANT';
  }

  private roleMetrics(role: string, metrics: AnalyticsMetric[]): AnalyticsMetric[] {
    const preferred: Record<string, string[]> = {
      TELECALLER: [
        'lead_count',
        'call_count',
        'call_connection_rate',
        'conversation_backlog',
        'active_pipeline',
      ],
      SALESPERSON: [
        'lead_count',
        'active_pipeline',
        'conversation_backlog',
        'test_ride_count',
        'booking_count',
        'lead_to_booking_rate',
        'delivered_count',
      ],
      TEST_RIDE_EXECUTIVE: ['test_ride_count', 'test_ride_completion_rate'],
      INVENTORY_EXECUTIVE: ['available_inventory'],
      BILLING_DOCUMENTATION_EXECUTIVE: [
        'booking_count',
        'finance_applications',
        'finance_approval_rate',
        'insurance_cases',
        'insurance_issuance_rate',
        'registration_backlog',
      ],
      DELIVERY_EXECUTIVE: ['delivered_count'],
      RC_REGISTRATION_EXECUTIVE: ['registration_backlog'],
    };
    const codes = preferred[role];
    if (!codes) return metrics.slice(0, 8);
    return codes
      .map((code) => metrics.find((item) => item.code === code))
      .filter((item): item is AnalyticsMetric => Boolean(item));
  }

  private roleSeries(role: string, series: AnalyticsSeries[]): AnalyticsSeries[] {
    const allowed: Record<string, string[]> = {
      TELECALLER: ['lead_trend', 'lead_funnel', 'conversation_status'],
      SALESPERSON: ['lead_trend', 'lead_funnel', 'source_distribution', 'conversation_status'],
      TEST_RIDE_EXECUTIVE: ['test_ride_status'],
      INVENTORY_EXECUTIVE: ['inventory_status'],
      BILLING_DOCUMENTATION_EXECUTIVE: [
        'finance_status',
        'insurance_status',
        'registration_status',
      ],
      DELIVERY_EXECUTIVE: ['delivery_status'],
      RC_REGISTRATION_EXECUTIVE: ['registration_status'],
    };
    const codes = allowed[role];
    if (!codes) return series.slice(0, 6);
    return codes
      .map((code) => series.find((item) => item.code === code))
      .filter((item): item is AnalyticsSeries => Boolean(item));
  }
}
