'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@gdm/ui/components/dialog';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { Textarea } from '@gdm/ui/components/textarea';
import { Clock3, LifeBuoy, LoaderCircle, ShieldAlert, ShieldOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiClientError } from '@/features/auth/auth-api-client';
import { useAuth } from '@/features/auth/auth-provider';
import { hasPermission } from '@/features/auth/auth-types';

const supportSchema = z.object({
  clientOrganizationId: z.string().trim().min(1, 'Select or enter a client organization.'),
  reason: z
    .string()
    .trim()
    .min(10, 'Provide at least 10 characters explaining the support need.')
    .max(500, 'Keep the reason within 500 characters.'),
});

type SupportForm = z.infer<typeof supportSchema>;

export function SupportElevationControl() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const session = auth.session;
  const canElevate =
    session !== null && hasPermission(session, 'platform.support_elevation.manage');
  const targets = session?.supportTargets ?? [];
  const form = useForm<SupportForm>({
    defaultValues: { clientOrganizationId: '', reason: '' },
    resolver: zodResolver(supportSchema),
  });

  if (!canElevate || session?.supportElevation !== null) {
    return null;
  }

  async function submit(values: SupportForm) {
    setServerError(null);
    try {
      await auth.startSupportElevation(values);
      form.reset();
      setOpen(false);
    } catch (caught) {
      setServerError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Support access could not be started. Try again.',
      );
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors">
        <LifeBuoy aria-hidden="true" className="size-4" />
        Start support access
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start audited support access</DialogTitle>
          <DialogDescription>
            Access is temporary, visible to you, revocable, and recorded with the reason below. The
            server decides the allowed lifetime and permissions.
          </DialogDescription>
        </DialogHeader>

        <form className="mt-6 space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="support-client">Client organization</Label>
            {targets.length > 0 ? (
              <Controller
                control={form.control}
                name="clientOrganizationId"
                render={({ field }) => (
                  <Select
                    disabled={form.formState.isSubmitting}
                    items={targets.map((target) => ({ label: target.name, value: target.id }))}
                    onValueChange={field.onChange}
                    value={field.value || null}
                  >
                    <SelectTrigger
                      aria-invalid={form.formState.errors.clientOrganizationId !== undefined}
                      id="support-client"
                    >
                      <SelectValue placeholder="Choose a permitted client" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((target) => (
                        <SelectItem key={target.id} value={target.id}>
                          {target.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <Input
                aria-describedby="support-client-help support-client-error"
                aria-invalid={form.formState.errors.clientOrganizationId !== undefined}
                autoComplete="off"
                disabled={form.formState.isSubmitting}
                id="support-client"
                placeholder="Client organization ID"
                {...form.register('clientOrganizationId')}
              />
            )}
            {targets.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-5" id="support-client-help">
                Enter the exact client ID supplied by platform operations. The backend still
                validates that this support target is allowed.
              </p>
            ) : null}
            <FieldError
              id="support-client-error"
              message={form.formState.errors.clientOrganizationId?.message}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-reason">Reason for access</Label>
            <Textarea
              aria-describedby="support-reason-error"
              aria-invalid={form.formState.errors.reason !== undefined}
              disabled={form.formState.isSubmitting}
              id="support-reason"
              placeholder="Describe the customer issue or investigation requiring access."
              {...form.register('reason')}
            />
            <FieldError id="support-reason-error" message={form.formState.errors.reason?.message} />
          </div>

          {serverError === null ? null : (
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>Support access was not started</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              disabled={form.formState.isSubmitting}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <LifeBuoy aria-hidden="true" data-icon="inline-start" />
              )}
              {form.formState.isSubmitting ? 'Starting access' : 'Start temporary access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupportElevationBanner() {
  const auth = useAuth();
  const elevation = auth.session?.supportElevation;
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (elevation === undefined || elevation === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [elevation]);

  const expired = useMemo(
    () => elevation !== undefined && elevation !== null && Date.parse(elevation.expiresAt) <= now,
    [elevation, now],
  );

  if (elevation === undefined || elevation === null) return null;

  async function endElevation() {
    setEnding(true);
    setError(null);
    try {
      await auth.endSupportElevation();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Support access could not be ended. Try again.',
      );
    } finally {
      setEnding(false);
    }
  }

  return (
    <aside
      aria-label="Active support elevation"
      className="border-b border-[var(--status-warning-border)] bg-[var(--status-warning-background)] px-4 py-3 text-[var(--status-warning-foreground)] sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              {expired ? 'Support access has expired' : 'Temporary support access is active'} ·{' '}
              {elevation.clientOrganization.name}
            </p>
            <p className="mt-0.5 text-xs leading-5">
              Reason: {elevation.reason} ·{' '}
              <span className="inline-flex items-center gap-1">
                <Clock3 aria-hidden="true" className="size-3" />
                {expired ? 'Expired' : `Expires ${formatDateTime(elevation.expiresAt)}`}
              </span>
            </p>
            {error === null ? null : <p className="mt-1 text-xs font-medium">{error}</p>}
          </div>
        </div>
        <Button disabled={ending} onClick={() => void endElevation()} size="sm" variant="outline">
          {ending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <ShieldOff aria-hidden="true" data-icon="inline-start" />
          )}
          {ending ? 'Ending access' : 'End support access'}
        </Button>
      </div>
    </aside>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message === undefined ? null : (
    <p className="text-destructive text-xs leading-5" id={id} role="alert">
      {message}
    </p>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
