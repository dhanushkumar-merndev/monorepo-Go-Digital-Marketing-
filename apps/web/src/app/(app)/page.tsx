'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Building2, Network, ShieldCheck, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { FoundationStatus } from '@/components/foundation-status';
import { AnalyticsWorkspace } from '@/features/analytics/analytics-workspace';
import { PlatformWorkspace } from '@/features/platform/platform-workspace';
import { useAuth } from '@/features/auth/auth-provider';

export default function SecureOverviewPage() {
  const session = useAuth().session;
  const membership = session?.currentMembership;

  if (session === null || membership === undefined || membership === null) return null;

  const platformOnly = membership.roleCode === 'AGENCY_ADMIN' && session.supportElevation === null;

  if (platformOnly) {
    return <PlatformWorkspace page="overview" />;
  }

  return (
    <div className="space-y-8">
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

      <section aria-labelledby="role-overview-heading" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold" id="role-overview-heading">
            Your operational overview
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Focused metrics and attention items for your role and effective assignment scope.
          </p>
        </div>
        <AnalyticsWorkspace compact />
      </section>

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

      {membership.roleCode === 'AGENCY_ADMIN' ? (
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
      ) : null}
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
