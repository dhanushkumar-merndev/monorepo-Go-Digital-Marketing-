'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Check, Copy, LoaderCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { safeReturnPath } from '@/features/auth/safe-return-path';

type Screen = 'checking' | 'choose' | 'enroll' | 'verify';

function SupabaseMfaContent() {
  const router = useRouter();
  const parameters = useSearchParams();
  const returnTo = safeReturnPath(parameters.get('returnTo'));
  const [screen, setScreen] = useState<Screen>('checking');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      router.replace('/login?reason=oauth');
      return;
    }
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      const { data, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || !data) {
        setError('Two-step verification status could not be checked. Try again.');
        return;
      }
      if (data.currentLevel === 'aal2') {
        router.replace(returnTo);
        return;
      }
      setScreen(data.nextLevel === 'aal2' ? 'verify' : 'choose');
    })();
  }, [returnTo, router]);

  async function beginEnrollment() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      });
      if (enrollError || data.type !== 'totp')
        throw enrollError ?? new Error('Could not start setup.');
      setFactorId(data.id);
      setManualKey(data.totp.secret);
      // Supabase returns the QR as an SVG data URI. Its serialized SVG can end
      // in a newline, which Next/Image rejects as a control character.
      setQrCode(data.totp.qr_code.trimEnd());
      setScreen('enroll');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start two-step setup.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      let selectedFactorId = factorId;
      if (!selectedFactorId) {
        const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        selectedFactorId = data.totp.find((factor) => factor.status === 'verified')?.id ?? null;
      }
      if (!selectedFactorId) throw new Error('No authenticator app is available for verification.');
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        code: code.trim(),
        factorId: selectedFactorId,
      });
      if (verifyError) throw verifyError;
      router.replace(returnTo);
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
    await navigator.clipboard.writeText(manualKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  const verifying = screen === 'verify';
  const enrolling = screen === 'enroll';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <ShieldCheck /> {verifying ? 'Verify your sign-in' : 'Protect your account'}
        </CardTitle>
        <CardDescription>
          {verifying
            ? 'Enter the current six-digit code from your authenticator app to continue.'
            : 'Two-step verification is required for every CRM role. Set up an authenticator app to continue.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Two-step verification</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {screen === 'checking' ? (
          <p className="flex items-center gap-2 text-sm">
            <LoaderCircle className="animate-spin" /> Checking account security…
          </p>
        ) : null}
        {screen === 'choose' ? (
          <div className="space-y-3">
            <Button className="w-full" disabled={busy} onClick={() => void beginEnrollment()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Set up
              authenticator app
            </Button>
          </div>
        ) : null}
        {enrolling ? (
          <div className="space-y-4">
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
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {verifying || enrolling ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Six-digit code</Label>
              <Input
                autoComplete="one-time-code"
                id="mfa-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
                required
                value={code}
              />
            </div>
            <Button className="w-full" disabled={busy || code.trim().length !== 6} type="submit">
              {busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              {enrolling ? 'Enable two-step verification' : 'Verify and continue'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function SupabaseMfaPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm">
            <LoaderCircle className="animate-spin" /> Checking account security…
          </CardContent>
        </Card>
      }
    >
      <SupabaseMfaContent />
    </Suspense>
  );
}
