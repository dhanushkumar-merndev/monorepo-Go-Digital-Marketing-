'use client';

import type { SemanticStatus } from '@gdm/design-tokens';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@gdm/ui/components/card';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Server, TriangleAlert } from 'lucide-react';

import { fetchApiHealth } from '@/lib/api-health';

function getStatusTone(status: string): SemanticStatus {
  const normalizedStatus = status.toLowerCase();

  if (['healthy', 'ok', 'ready', 'reachable', 'up'].includes(normalizedStatus)) {
    return 'success';
  }

  if (['down', 'error', 'failed', 'unavailable', 'unhealthy'].includes(normalizedStatus)) {
    return 'danger';
  }

  return 'warning';
}

function formatCheckedAt(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
}

export function FoundationStatus() {
  const healthQuery = useQuery({
    queryFn: ({ signal }) => fetchApiHealth(signal),
    queryKey: ['api-health'],
    refetchInterval: 60_000,
  });

  if (healthQuery.isPending) {
    return (
      <Card aria-busy="true" aria-label="Checking API connectivity">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (healthQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API connectivity</CardTitle>
          <CardDescription>The web shell could not verify the configured API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>API unavailable</AlertTitle>
            <AlertDescription>
              Start the API and confirm that NEXT_PUBLIC_API_URL points to its versioned base URL.
            </AlertDescription>
          </Alert>
          <Button
            disabled={healthQuery.isFetching}
            onClick={() => void healthQuery.refetch()}
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={healthQuery.isFetching ? 'animate-spin' : undefined}
              data-icon="inline-start"
            />
            {healthQuery.isFetching ? 'Retrying' : 'Retry check'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const health = healthQuery.data;

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server aria-hidden="true" className="text-primary size-4" />
          API connectivity
        </CardTitle>
        <CardDescription>
          Live response from the configured NestJS health endpoint. Dependency detail remains
          server-reported.
        </CardDescription>
        <CardAction>
          <StatusBadge tone={getStatusTone(health.status)}>{health.status}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="border-border bg-muted/45 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              HTTP response
            </dt>
            <dd className="mt-1 font-semibold">{health.httpStatus}</dd>
          </div>
          <div className="border-border bg-muted/45 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Last checked
            </dt>
            <dd className="mt-1 font-semibold">{formatCheckedAt(health.checkedAt)}</dd>
          </div>
        </dl>

        {health.checks.length > 0 ? (
          <ul
            aria-label="API component checks"
            className="divide-border divide-y rounded-lg border"
          >
            {health.checks.map((check) => (
              <li className="flex items-center justify-between gap-4 px-3 py-3" key={check.name}>
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Activity aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{check.name}</span>
                </span>
                <StatusBadge tone={getStatusTone(check.status)}>{check.status}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-sm">
            The overview response did not include component-level checks. Database and Redis detail
            is available from the API readiness endpoint.
          </p>
        )}

        <div className="border-border flex flex-col items-start justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
          <code className="bg-muted text-muted-foreground max-w-full overflow-x-auto rounded px-2 py-1 text-xs">
            {health.endpoint}
          </code>
          <Button
            disabled={healthQuery.isFetching}
            onClick={() => void healthQuery.refetch()}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={healthQuery.isFetching ? 'animate-spin' : undefined}
              data-icon="inline-start"
            />
            {healthQuery.isFetching ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
