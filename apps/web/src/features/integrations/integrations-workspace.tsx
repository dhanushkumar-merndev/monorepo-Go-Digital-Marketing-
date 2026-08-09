'use client';
import { Alert, AlertDescription } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Skeleton } from '@gdm/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';

interface Connection {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  webhook_state: string;
  last_failure_at: string | null;
  failure_summary: string | null;
}
interface OnboardingItem {
  item_code: string;
  complete: boolean;
  evidence: string | null;
}
export function IntegrationsWorkspace() {
  const { api } = useAuth();
  const cache = useQueryClient();
  const centre = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.request<{ connections: Connection[] }>('/integrations'),
  });
  const onboarding = useQuery({
    queryKey: ['integration-onboarding'],
    queryFn: () => api.request<{ items: OnboardingItem[] }>('/integrations/onboarding'),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) =>
      api.request(`/integrations/connections/${id}/disconnect`, { method: 'POST' }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['integrations'] }),
  });
  const error = centre.error ?? onboarding.error ?? disconnect.error;
  return (
    <PermissionGate permission="integrations.read">
      <div className="space-y-6">
        <PageHeader
          title="Integration centre"
          description="Official provider state, onboarding evidence and failures. Credentials, OAuth codes and customer content never appear here."
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : 'Integration state could not be loaded.'}
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Provider connections</CardTitle>
            <CardDescription>
              Only verified official provider connections may become active. Disconnect stops future
              sends and retains history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {centre.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : centre.data?.connections.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Failure</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {centre.data.connections.map((connection) => (
                    <TableRow key={connection.id}>
                      <TableCell>
                        {connection.display_name}
                        <div className="text-muted-foreground text-xs">{connection.provider}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            connection.status === 'ACTIVE'
                              ? 'success'
                              : connection.status === 'DEGRADED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {connection.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{connection.webhook_state}</TableCell>
                      <TableCell className="max-w-56 truncate">
                        {connection.failure_summary ?? '—'}
                      </TableCell>
                      <TableCell>
                        <PermissionGate permission="integrations.manage">
                          <Button
                            disabled={disconnect.isPending || connection.status === 'DISCONNECTED'}
                            onClick={() => disconnect.mutate(connection.id)}
                            size="sm"
                            variant="outline"
                          >
                            Disconnect
                          </Button>
                        </PermissionGate>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No provider connections"
                description="Configure official provider credentials through the secure administrator connection flow."
                icon={<PlugZap />}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Client onboarding</CardTitle>
            <CardDescription>
              Legal details, consent, templates and pilot verification are auditable evidence—not a
              claim that providers are production-ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {onboarding.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {onboarding.data?.items.map((item) => (
                  <div
                    className="flex items-center justify-between rounded-md border p-3"
                    key={item.item_code}
                  >
                    <span className="text-sm">{item.item_code.replaceAll('_', ' ')}</span>
                    <Badge variant={item.complete ? 'success' : 'secondary'}>
                      {item.complete ? 'Complete' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI safety boundary</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm">
            <ShieldCheck className="text-primary size-5" />
            Creative publishing and CRM changes require explicit human review; auto-calling and
            unofficial WhatsApp automation remain blocked.
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}
