'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Label } from '@gdm/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { Building2, CheckCircle2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ApiClientError } from '@/features/auth/auth-api-client';
import { useAuth } from '@/features/auth/auth-provider';
import { hasPermission } from '@/features/auth/auth-types';

interface TenantSelectorProps {
  presentation?: 'compact' | 'full';
}

export function TenantSelector({ presentation = 'compact' }: TenantSelectorProps) {
  const auth = useAuth();
  const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const memberships = useMemo(
    () => auth.session?.memberships.filter((membership) => membership.status === 'active') ?? [],
    [auth.session?.memberships],
  );
  const currentMembershipId = auth.session?.currentMembership?.id ?? null;
  const canSwitch = auth.session !== null && hasPermission(auth.session, 'account.tenant.select');
  const switching = pendingMembershipId !== null;

  async function handleMembershipChange(value: string | null) {
    if (value === null || value === currentMembershipId) return;
    setPendingMembershipId(value);
    setError(null);
    setMessage(null);
    try {
      await auth.switchMembership(value);
      const organization = memberships.find(
        (membership) => membership.id === value,
      )?.clientOrganization;
      setMessage(
        organization === undefined ? 'Workspace changed.' : `Now working in ${organization.name}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The workspace could not be changed. Try again.',
      );
    } finally {
      setPendingMembershipId(null);
    }
  }

  if (memberships.length === 0) {
    return (
      <Alert variant="info">
        <Building2 aria-hidden="true" />
        <AlertTitle>No permitted client workspaces</AlertTitle>
        <AlertDescription>
          Ask an administrator to add or reactivate a membership before continuing.
        </AlertDescription>
      </Alert>
    );
  }

  if (memberships.length === 1 && currentMembershipId !== null && presentation === 'compact') {
    return (
      <div className="min-w-0">
        <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
          Client
        </p>
        <p className="truncate text-sm font-semibold">{memberships[0]?.clientOrganization.name}</p>
      </div>
    );
  }

  const items = memberships.map((membership) => ({
    label: membership.clientOrganization.name,
    value: membership.id,
  }));

  return (
    <div className={presentation === 'full' ? 'space-y-3' : 'min-w-0 space-y-1.5'}>
      <Label htmlFor={`tenant-selector-${presentation}`}>
        {presentation === 'full' ? 'Client workspace' : 'Working in'}
      </Label>
      <Select
        disabled={switching || !canSwitch}
        items={items}
        onValueChange={(value) => void handleMembershipChange(value)}
        value={currentMembershipId}
      >
        <SelectTrigger
          aria-label="Client workspace"
          className={presentation === 'compact' ? 'w-full md:w-64' : undefined}
          id={`tenant-selector-${presentation}`}
        >
          <SelectValue placeholder={switching ? 'Changing workspace…' : 'Choose a workspace'} />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((membership) => (
            <SelectItem key={membership.id} value={membership.id}>
              {membership.clientOrganization.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!canSwitch && memberships.length > 1 ? (
        <p className="text-muted-foreground text-xs leading-5">
          Your current permissions do not allow switching client workspaces.
        </p>
      ) : null}

      <div aria-live="polite">
        {error === null ? null : (
          <p className="text-destructive flex items-start gap-1.5 text-xs leading-5">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        )}
        {message === null ? null : (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-[var(--status-success-foreground)]">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
