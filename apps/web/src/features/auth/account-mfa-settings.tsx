'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { Check, Copy, LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type MfaSettingsState = 'checking' | 'choose' | 'configured' | 'enroll';

export function AccountMfaSettings({ canManage }: { canManage: boolean }) {
  const supabase = getSupabaseBrowserClient();
  const [state, setState] = useState<MfaSettingsState>(supabase ? 'checking' : 'choose');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    supabase ? null : 'Two-step verification is not configured for this environment.',
  );

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    void supabase.auth.mfa.listFactors().then(({ data, error: factorsError }) => {
      if (cancelled) return;
      if (factorsError) {
        setError('Two-step verification status could not be loaded. Try again.');
        setState('choose');
        return;
      }
      const verifiedFactor = data.totp.find((factor) => factor.status === 'verified');
      setFactorId(verifiedFactor?.id ?? null);
      setState(verifiedFactor ? 'configured' : 'choose');
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function beginEnrollment() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      });
      if (enrollError || data.type !== 'totp') {
        throw enrollError ?? new Error('Could not start authenticator setup.');
      }
      setFactorId(data.id);
      setManualKey(data.totp.secret);
      setQrCode(data.totp.qr_code.trimEnd());
      setState('enroll');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start two-step setup.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment() {
    if (!supabase || !factorId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        code: code.trim(),
        factorId,
      });
      if (verifyError) throw verifyError;
      setCode('');
      setManualKey(null);
      setQrCode(null);
      setState('configured');
      setSuccess('Two-step verification is now configured for this account.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The verification code was not accepted.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!manualKey) return;
    try {
      await navigator.clipboard.writeText(manualKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError('The setup key could not be copied. Select and copy it manually.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="secondary">Account security</Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Two-step verification</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
            Use an authenticator app to protect password and Google sign-in.
          </p>
        </div>
        {state === 'configured' ? <StatusBadge tone="success">Configured</StatusBadge> : null}
      </div>

      {success ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Security updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Two-step verification</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="text-primary size-4" />
            Authenticator app
          </CardTitle>
          <CardDescription>
            A current six-digit code is required when the sign-in policy requests verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'checking' ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Checking status…
            </p>
          ) : null}

          {state === 'choose' ? (
            canManage ? (
              <Button disabled={busy} onClick={() => void beginEnrollment()}>
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                Set up authenticator app
              </Button>
            ) : (
              <Alert variant="info">
                <ShieldAlert aria-hidden="true" />
                <AlertTitle>Read-only security settings</AlertTitle>
                <AlertDescription>
                  Contact your administrator to change account security settings.
                </AlertDescription>
              </Alert>
            )
          ) : null}

          {state === 'configured' ? (
            <p className="text-muted-foreground text-sm leading-6">
              An authenticator app is connected. Two-step verification remains enforced by the
              sign-in policy.
            </p>
          ) : null}

          {state === 'enroll' ? (
            <div className="space-y-5">
              <p className="text-sm font-medium">
                Scan this code in Google Authenticator or another authenticator app.
              </p>
              {qrCode ? (
                <Image
                  alt="Authenticator setup QR code"
                  className="mx-auto size-52 rounded-md border bg-white p-2"
                  height={208}
                  src={qrCode}
                  unoptimized
                  width={208}
                />
              ) : null}
              <div className="space-y-2">
                <Label>Manual setup key</Label>
                <div className="bg-muted flex items-center gap-2 rounded-md p-2">
                  <code className="min-w-0 flex-1 text-sm break-all">{manualKey}</code>
                  <Button
                    aria-label={copied ? 'Copied setup key' : 'Copy setup key'}
                    onClick={() => void copyKey()}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
              </div>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void verifyEnrollment();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="account-settings-mfa-code">Six-digit code</Label>
                  <Input
                    autoComplete="one-time-code"
                    id="account-settings-mfa-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    value={code}
                  />
                </div>
                <Button disabled={busy || code.trim().length !== 6} type="submit">
                  {busy ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  Enable two-step verification
                </Button>
              </form>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
