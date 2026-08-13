import { z } from 'zod';

const optionalUuid = z.string().uuid().optional();

export const analyticsComparisonSchema = z.enum([
  'NONE',
  'PREVIOUS_PERIOD',
  'PREVIOUS_MONTH',
  'PREVIOUS_YEAR',
]);

export const analyticsQuerySchema = z
  .object({
    branch_id: optionalUuid,
    channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS']).optional(),
    compare: analyticsComparisonSchema.default('PREVIOUS_PERIOD'),
    department_id: optionalUuid,
    from: z.string().date(),
    model: z.string().trim().max(160).optional(),
    source: z.enum(['META', 'WHATSAPP_AD', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'OTHER']).optional(),
    team_id: optionalUuid,
    timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
    to: z.string().date(),
    user_id: optionalUuid,
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must not be later than to',
    path: ['from'],
  });

export const analyticsDrilldownSchema = z.enum([
  'NO_DRILLDOWN',
  'AGGREGATE_DRILLDOWN',
  'RECORD_DRILLDOWN',
]);
export const analyticsMetricUnitSchema = z.enum([
  'COUNT',
  'PERCENT',
  'SECONDS',
  'MINUTES',
  'MONEY_MINOR',
]);
export const analyticsMetricStateSchema = z.enum([
  'AVAILABLE',
  'NO_DATA',
  'UNAVAILABLE',
  'NOT_PERMITTED',
]);

export const analyticsMetricSchema = z.object({
  code: z.string().min(1).max(100),
  comparison: z
    .object({
      absolute_change: z.number(),
      change_kind: z.enum(['PERCENT_CHANGE', 'PERCENTAGE_POINTS', 'ABSOLUTE']),
      previous_value: z.number(),
      value: z.number().nullable(),
    })
    .nullable(),
  definition: z.string().min(1).max(500),
  direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL']),
  drilldown: analyticsDrilldownSchema,
  label: z.string().min(1).max(120),
  state: analyticsMetricStateSchema,
  unit: analyticsMetricUnitSchema,
  value: z.number().nullable(),
});

export const analyticsSeriesSchema = z.object({
  code: z.string().min(1).max(100),
  dataset: z.array(
    z.object({
      category: z.string(),
      comparison: z.number().nullable().optional(),
      value: z.number(),
    }),
  ),
  description: z.string().min(1).max(500),
  drilldown: analyticsDrilldownSchema,
  label: z.string().min(1).max(120),
  type: z.enum(['LINE', 'BAR', 'STACKED_BAR', 'FUNNEL', 'DONUT', 'HEATMAP']),
  unit: analyticsMetricUnitSchema.default('COUNT'),
});

export const analyticsAttentionItemSchema = z.object({
  code: z.string().min(1).max(100),
  count: z.number().int().nonnegative(),
  drilldown: analyticsDrilldownSchema,
  href: z.string().nullable(),
  label: z.string().min(1).max(160),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
});

export const analyticsOverviewResponseSchema = z.object({
  attention: z.array(analyticsAttentionItemSchema),
  available_dimensions: z.array(
    z.enum(['BRANCH', 'DEPARTMENT', 'TEAM', 'USER', 'SOURCE', 'MODEL', 'CHANNEL']),
  ),
  freshness: z.object({
    generated_at: z.iso.datetime({ offset: true }),
    mode: z.enum(['NEAR_REAL_TIME', 'CACHED']),
  }),
  metrics: z.array(analyticsMetricSchema),
  range: z.object({
    compare_from: z.string().date().nullable(),
    compare_to: z.string().date().nullable(),
    from: z.string().date(),
    timezone: z.string(),
    to: z.string().date(),
  }),
  role: z.string(),
  scope: z.enum(['PLATFORM_AGGREGATE', 'TENANT', 'BRANCH', 'TEAM', 'OWN']),
  series: z.array(analyticsSeriesSchema),
});

export const analyticsPlatformClientSchema = z.object({
  active_users: z.number().int().nonnegative(),
  bookings: z.number().int().nonnegative(),
  branches: z.number().int().nonnegative(),
  booking_to_delivery_rate: z.number().min(0).max(100),
  client_id: z.string().uuid(),
  client_name: z.string(),
  deliveries: z.number().int().nonnegative(),
  integration_health: z.enum(['HEALTHY', 'DEGRADED', 'NOT_CONFIGURED']),
  lead_to_booking_rate: z.number().min(0).max(100),
  leads: z.number().int().nonnegative(),
  modules_enabled: z.number().int().nonnegative(),
  status: z.string(),
  users: z.number().int().nonnegative(),
});

export const analyticsPlatformLeadTrendSchema = z.object({
  categories: z.array(z.string()),
  series: z.array(
    z.object({
      client_id: z.string().uuid(),
      client_name: z.string(),
      values: z.array(z.number().int().nonnegative()),
    }),
  ),
});

export const analyticsPlatformResponseSchema = analyticsOverviewResponseSchema.extend({
  clients: z.array(analyticsPlatformClientSchema),
  lead_trend: analyticsPlatformLeadTrendSchema,
});

export type AnalyticsAttentionItem = z.infer<typeof analyticsAttentionItemSchema>;
export type AnalyticsComparison = z.infer<typeof analyticsComparisonSchema>;
export type AnalyticsMetric = z.infer<typeof analyticsMetricSchema>;
export type AnalyticsOverviewResponse = z.infer<typeof analyticsOverviewResponseSchema>;
export type AnalyticsPlatformLeadTrend = z.infer<typeof analyticsPlatformLeadTrendSchema>;
export type AnalyticsPlatformResponse = z.infer<typeof analyticsPlatformResponseSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsSeries = z.infer<typeof analyticsSeriesSchema>;
