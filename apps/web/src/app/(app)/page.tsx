'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Building2, KeyRound, Network, ShieldCheck, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { FoundationStatus } from '@/components/foundation-status';
import { useAuth } from '@/features/auth/auth-provider';

export default function SecureOverviewPage() {
  const session = useAuth().session;
  const membership = session?.currentMembership;

  if (session === null || membership === undefined || membership === null) return null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="overview-heading" className="space-y-4">
        <Badge variant="secondary">Secure workspace</Badge>
        <div className="max-w-3xl space-y-3">
          <h1
            className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            id="overview-heading"
          >
            Welcome, {session.user.displayName}
          </h1>
          <p className="text-muted-foreground text-base leading-7 sm:text-lg">
            You are working in {membership.clientOrganization.name} as {membership.roleName}.
            Navigation is filtered using the effective permissions returned by the API; the API
            remains authoritative for every request.
          </p>
        </div>
      </section>

      {session.supportElevation === null ? null : (
        <Alert variant="info">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Audited support context</AlertTitle>
          <AlertDescription>
            This workspace is being viewed through a temporary support elevation. The persistent
            banner shows its reason and expiry.
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="access-heading" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold" id="access-heading">
            Your access context
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Membership, branch, team and permission information reported by the server.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AccessCard
            description={membership.clientOrganization.name}
            icon={<Building2 aria-hidden="true" className="size-4" />}
            title="Client"
          />
          <AccessCard
            description={membership.roleName}
            icon={<ShieldCheck aria-hidden="true" className="size-4" />}
            title="Effective role"
          />
          <AccessCard
            description={
              membership.branchNames.length === 0
                ? 'No named branch scope'
                : membership.branchNames.join(', ')
            }
            icon={<Network aria-hidden="true" className="size-4" />}
            title="Branch scope"
          />
          <AccessCard
            description={
              membership.teamNames.length === 0
                ? 'No named team scope'
                : membership.teamNames.join(', ')
            }
            icon={<UsersRound aria-hidden="true" className="size-4" />}
            title="Team scope"
          />
        </div>
      </section>

      <section aria-labelledby="permissions-heading" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold" id="permissions-heading">
            Effective permissions
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            These codes explain visible actions; they do not replace backend authorization.
          </p>
        </div>
        <Card>
          <CardContent>
            {session.permissions.length === 0 ? (
              <EmptyState
                description="No permission codes were returned for this membership. Protected actions remain unavailable until the server grants them."
                icon={<KeyRound aria-hidden="true" className="size-5" />}
                title="No effective permissions"
              />
            ) : (
              <ul aria-label="Effective permission codes" className="flex flex-wrap gap-2">
                {session.permissions.map((permission) => (
                  <li key={permission}>
                    <Badge variant="outline">{permission}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="connectivity-heading" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold" id="connectivity-heading">
            Platform connectivity
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Live API health; no dealership workflow or integration status is fabricated here.
          </p>
        </div>
        <div className="max-w-2xl">
          <FoundationStatus />
        </div>
      </section>
    </div>
  );
}

function AccessCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription className="break-words">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
