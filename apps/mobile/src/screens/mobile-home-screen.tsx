import { analyticsOverviewResponseSchema, type AnalyticsMetric } from '@gdm/contracts';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { Alert, AppText, Badge, Card } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { mobileRolePresentation } from '../auth/mobile-access';
import { useAuth } from '../auth/auth-provider';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';

export function MobileHomeScreen() {
  const { request } = useAuth();
  const connectivity = useAppStore((state) => state.connectivity);
  const principal = useAuthStore((state) => state.principal);
  const presentation = principal ? mobileRolePresentation(principal.roleCode) : null;
  const range = lastThirtyDays();
  const analytics = useQuery({
    enabled: connectivity !== 'offline',
    queryKey: ['mobile', 'analytics', range.from, range.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        compare: 'PREVIOUS_PERIOD',
        from: range.from,
        timezone: 'Asia/Kolkata',
        to: range.to,
      });
      const response = await request(`/analytics/overview?${params.toString()}`);
      if (!response.ok) throw new Error(`Analytics request failed (${String(response.status)}).`);
      return analyticsOverviewResponseSchema.parse(await response.json());
    },
    staleTime: 30_000,
  });

  return (
    <MobileShell title="Home">
      {connectivity === 'offline' ? (
        <Alert
          description="Authenticated server work waits until connectivity returns. Your refresh token remains in secure device storage."
          title="Offline"
          tone="warning"
        />
      ) : null}

      <Card>
        <View className="gap-2">
          <Badge label={presentation?.accent ?? 'Mobile workspace'} tone="success" />
          <AppText accessibilityRole="header" variant="heading">
            Welcome, {principal?.displayName ?? 'team member'}
          </AppText>
          <AppText tone="muted">
            {presentation?.landingDescription ??
              'Your server-authorized mobile workspace is available.'}
          </AppText>
        </View>
      </Card>

      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <AppText accessibilityRole="header" variant="heading">
            Your 30-day overview
          </AppText>
          <Badge label={principal?.roleCode.replaceAll('_', ' ') ?? 'ROLE'} tone="info" />
        </View>
        {analytics.isPending ? (
          <Card accessibilityLabel="Loading analytics">
            <AppText tone="muted">Loading authorized metrics…</AppText>
          </Card>
        ) : analytics.isError ? (
          <Alert
            description="Pull to retry when the connection is available. Operational routes remain usable."
            title="Analytics unavailable"
            tone="warning"
          />
        ) : analytics.data.metrics.length === 0 ? (
          <Card>
            <AppText tone="muted">No metrics are available for this role and scope.</AppText>
          </Card>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {analytics.data.metrics.slice(0, 4).map((metric) => (
              <MetricCard key={metric.code} metric={metric} />
            ))}
          </View>
        )}
      </View>

      {analytics.data?.attention.length ? (
        <Card>
          <AppText accessibilityRole="header" variant="heading">
            Needs attention
          </AppText>
          <View className="gap-3">
            {analytics.data.attention.slice(0, 4).map((item) => (
              <View className="flex-row items-center justify-between gap-3" key={item.code}>
                <AppText className="flex-1">{item.label}</AppText>
                <Badge
                  label={String(item.count)}
                  tone={item.severity === 'CRITICAL' ? 'danger' : 'warning'}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Alert
        description="Only routes allowed by your active membership are shown. The NestJS API still verifies every permission, branch, team and assignment."
        title="Server-authorized access"
        tone="info"
      />
    </MobileShell>
  );
}

function MetricCard({ metric }: { metric: AnalyticsMetric }) {
  const comparison = metric.comparison?.value;
  return (
    <Card className="min-w-[46%] flex-1">
      <AppText tone="muted" variant="caption">
        {metric.label}
      </AppText>
      <AppText accessibilityLabel={`${metric.label}: ${formatMetric(metric)}`} variant="title">
        {formatMetric(metric)}
      </AppText>
      {comparison === null || comparison === undefined ? null : (
        <AppText tone="muted" variant="caption">
          {comparison >= 0 ? '+' : ''}
          {comparison.toFixed(1)}
          {metric.comparison?.change_kind === 'PERCENT_CHANGE' ? '%' : ''} vs prior
        </AppText>
      )}
    </Card>
  );
}

function formatMetric(metric: AnalyticsMetric): string {
  if (metric.value === null) return '—';
  if (metric.unit === 'PERCENT') return `${metric.value.toFixed(1)}%`;
  if (metric.unit === 'MONEY_MINOR')
    return new Intl.NumberFormat('en-IN', { currency: 'INR', style: 'currency' }).format(
      metric.value / 100,
    );
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(metric.value);
}

function lastThirtyDays(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return { from: localDate(from), to: localDate(today) };
}

function localDate(value: Date): string {
  return `${String(value.getFullYear())}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
