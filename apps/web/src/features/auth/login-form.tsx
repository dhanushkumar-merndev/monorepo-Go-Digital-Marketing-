'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Separator } from '@gdm/ui/components/separator';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import * as QRCode from 'qrcode';
import { z } from 'zod';

import { ApiClientError } from './auth-api-client';
import { googleLoginErrorMessage, type AuthenticationErrorMessage } from './google-auth-errors';
import { GoogleIdentityButton } from './google-identity-services';
import { useAuth } from './auth-provider';
import type { GoogleCredentialInput, MfaEnrollmentSetup, MfaLoginChallenge } from './auth-types';
import { safeReturnPath } from './safe-return-path';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));
  const [googleError, setGoogleError] = useState<AuthenticationErrorMessage | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaLoginChallenge | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaEnrollmentSetup | null>(null);
  const [mfaMethod, setMfaMethod] = useState<'RECOVERY_CODE' | 'TOTP'>('TOTP');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [manualKeyCopied, setManualKeyCopied] = useState(false);
  const [recoveryCodesCopied, setRecoveryCodesCopied] = useState(false);
  const [recoveryCodesDownloaded, setRecoveryCodesDownloaded] = useState(false);
  const [recoveryCodesExportError, setRecoveryCodesExportError] = useState<string | null>(null);
  const [recoveryCodesExporting, setRecoveryCodesExporting] = useState(false);
  const [qrCodeReady, setQrCodeReady] = useState(false);
  const [qrCodeUnavailable, setQrCodeUnavailable] = useState(false);
  const [qrScanInstructionsOpen, setQrScanInstructionsOpen] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const qrCodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const signInAttemptRef = useRef(false);
  const form = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  });
  const serverError = form.formState.errors.root?.message;
  const restoring = auth.status === 'loading';

  useEffect(() => {
    if (auth.status === 'authenticated' && recoveryCodes === null && !signInAttemptRef.current) {
      router.replace(returnTo);
    }
  }, [auth.status, recoveryCodes, returnTo, router]);

  useEffect(() => {
    const canvas = qrCodeCanvasRef.current;
    if (!mfaSetup || !canvas) return;

    let cancelled = false;
    setQrCodeReady(false);
    setQrCodeUnavailable(false);
    void QRCode.toCanvas(canvas, mfaSetup.otpauthUri, {
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 208,
    })
      .then(() => {
        if (!cancelled) setQrCodeReady(true);
      })
      .catch(() => {
        if (!cancelled) setQrCodeUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [mfaSetup]);

  async function beginMfa(challenge: MfaLoginChallenge) {
    setMfaChallenge(challenge);
    setMfaError(null);
    setMfaMethod('TOTP');
    if (challenge.status === 'MFA_ENROLLMENT_REQUIRED') {
      setMfaBusy(true);
      try {
        setMfaSetup(await auth.startMfaEnrollment(challenge.challengeToken));
      } catch (caught) {
        setMfaError(
          caught instanceof ApiClientError
            ? caught.message
            : 'Authenticator enrollment could not be started.',
        );
      } finally {
        setMfaBusy(false);
      }
    }
  }

  async function submit(values: LoginFormValues) {
    signInAttemptRef.current = true;
    form.clearErrors('root');
    setGoogleError(null);
    try {
      const challenge = await auth.login(values, returnTo);
      if (challenge) await beginMfa(challenge);
    } catch (caught) {
      signInAttemptRef.current = false;
      const error = caught instanceof ApiClientError ? caught : null;
      const message =
        error?.code === 'ACCOUNT_SUSPENDED' || error?.code === 'ACCOUNT_INACTIVE'
          ? 'This account is disabled. Contact your administrator to restore access.'
          : error?.code === 'INVALID_CREDENTIALS'
            ? 'The email or password is incorrect.'
            : (error?.message ?? 'Sign in could not be completed. Try again.');
      form.setError('root', { message });
    }
  }

  async function signInWithGoogle(input: GoogleCredentialInput) {
    signInAttemptRef.current = true;
    setGoogleError(null);
    try {
      const challenge = await auth.loginWithGoogle(input, returnTo);
      if (challenge) await beginMfa(challenge);
    } catch (caught) {
      signInAttemptRef.current = false;
      throw caught;
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallenge) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      if (mfaChallenge.status === 'MFA_ENROLLMENT_REQUIRED') {
        const codes = await auth.confirmMfaEnrollment(
          mfaChallenge.challengeToken,
          mfaCode,
          returnTo,
        );
        setRecoveryCodes(codes);
      } else {
        const replacement = await auth.verifyMfa(
          mfaChallenge.challengeToken,
          mfaMethod,
          mfaCode,
          returnTo,
        );
        if (replacement) setRecoveryCodes([replacement]);
      }
    } catch (caught) {
      setMfaError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The authentication code could not be verified.',
      );
    } finally {
      setMfaBusy(false);
    }
  }

  async function copyManualSetupKey() {
    if (!mfaSetup || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(mfaSetup.manualSecret);
      setManualKeyCopied(true);
      window.setTimeout(() => setManualKeyCopied(false), 2_000);
    } catch {
      setManualKeyCopied(false);
    }
  }

  async function copyRecoveryCodes() {
    if (recoveryCodes === null || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setRecoveryCodesCopied(true);
      window.setTimeout(() => setRecoveryCodesCopied(false), 2_000);
    } catch {
      setRecoveryCodesCopied(false);
    }
  }

  async function downloadRecoveryCodes() {
    if (recoveryCodes === null) return;

    setRecoveryCodesExporting(true);
    setRecoveryCodesExportError(null);
    try {
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Recovery Codes');
      worksheet.columns = [{ header: 'Recovery code', key: 'code', width: 28 }];
      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      recoveryCodes.forEach((code) => worksheet.addRow({ code }));

      const file = new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.download = 'go-digital-recovery-codes.xlsx';
      link.href = url;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setRecoveryCodesDownloaded(true);
      window.setTimeout(() => setRecoveryCodesDownloaded(false), 2_000);
    } catch {
      setRecoveryCodesExportError('The Excel file could not be created. Copy the codes instead.');
    } finally {
      setRecoveryCodesExporting(false);
    }
  }

  if (recoveryCodes !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck aria-hidden="true" /> Save your recovery{' '}
            {recoveryCodes.length === 1 ? 'code' : 'codes'}
          </CardTitle>
          <CardDescription>
            These codes are shown once. Store them securely outside this browser before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Recovery codes</p>
            <div className="flex items-center gap-1">
              <div className="group relative">
                <Button
                  aria-label={
                    recoveryCodesCopied ? 'Copied all recovery codes' : 'Copy all recovery codes'
                  }
                  onClick={() => void copyRecoveryCodes()}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {recoveryCodesCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
                <span
                  className="bg-popover text-popover-foreground pointer-events-none absolute top-0 right-0 z-10 -translate-y-[calc(100%+0.5rem)] rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  role="tooltip"
                >
                  {recoveryCodesCopied ? 'Copied' : 'Copy all'}
                </span>
              </div>
              <div className="group relative">
                <Button
                  aria-label={
                    recoveryCodesDownloaded
                      ? 'Downloaded recovery codes'
                      : 'Download recovery codes as Excel'
                  }
                  disabled={recoveryCodesExporting}
                  onClick={() => void downloadRecoveryCodes()}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {recoveryCodesDownloaded ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Download aria-hidden="true" />
                  )}
                </Button>
                <span
                  className="bg-popover text-popover-foreground pointer-events-none absolute top-0 right-0 z-10 -translate-y-[calc(100%+0.5rem)] rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  role="tooltip"
                >
                  {recoveryCodesDownloaded ? 'Downloaded' : 'Download Excel'}
                </span>
              </div>
            </div>
          </div>
          <div
            className="bg-muted/40 grid gap-2 rounded-md border p-4 font-mono text-sm"
            role="list"
          >
            {recoveryCodes.map((code) => (
              <span key={code} role="listitem">
                {code}
              </span>
            ))}
          </div>
          {recoveryCodesExportError ? (
            <p className="text-destructive text-sm" role="alert">
              {recoveryCodesExportError}
            </p>
          ) : null}
          <Button className="w-full" onClick={() => router.replace(returnTo)} size="lg">
            I saved the {recoveryCodes.length === 1 ? 'code' : 'codes'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (mfaChallenge !== null) {
    const enrollment = mfaChallenge.status === 'MFA_ENROLLMENT_REQUIRED';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {enrollment ? 'Set up two-step verification' : 'Verify your sign-in'}
          </CardTitle>
          <CardDescription>
            {enrollment
              ? 'Agency administrators must use an authenticator app. Add the account, then enter its six-digit code.'
              : 'Enter the current code from your authenticator app.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {mfaBusy && mfaSetup === null && enrollment ? (
            <div className="flex items-center gap-2 text-sm">
              <LoaderCircle className="animate-spin" /> Preparing enrollment…
            </div>
          ) : null}
          {mfaSetup ? (
            <div className="space-y-2 rounded-md border p-4">
              <div className="space-y-3 border-b pb-4">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium">Scan QR code</p>
                    <div
                      className="relative"
                      onMouseEnter={() => setQrScanInstructionsOpen(true)}
                      onMouseLeave={() => setQrScanInstructionsOpen(false)}
                    >
                      <Button
                        aria-label="QR scan instructions"
                        className="size-6"
                        onBlur={() => setQrScanInstructionsOpen(false)}
                        onClick={() => setQrScanInstructionsOpen(true)}
                        onFocus={() => setQrScanInstructionsOpen(true)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Info aria-hidden="true" className="size-4" />
                      </Button>
                      <span
                        className={`bg-popover text-popover-foreground pointer-events-none absolute top-full left-0 z-10 mt-2 w-72 rounded-md border p-3 text-xs leading-relaxed shadow-md transition-opacity ${
                          qrScanInstructionsOpen ? 'opacity-100' : 'opacity-0'
                        }`}
                        role="tooltip"
                      >
                        Use Google Authenticator’s <strong>+ → Scan a QR code</strong> on another
                        device. A phone cannot scan a QR code displayed on its own screen.
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  aria-busy={!qrCodeReady && !qrCodeUnavailable}
                  className="flex min-h-52 items-center justify-center"
                >
                  {!qrCodeReady && !qrCodeUnavailable ? (
                    <div className="bg-muted h-52 w-52 animate-pulse rounded-md" />
                  ) : null}
                  <canvas
                    aria-label="Authenticator setup QR code"
                    className={qrCodeReady ? 'rounded-md border' : 'hidden'}
                    ref={qrCodeCanvasRef}
                    role="img"
                  />
                  {qrCodeUnavailable ? (
                    <p className="text-muted-foreground text-center text-sm">
                      QR code could not be generated. Use the manual setup key below.
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-sm font-medium">Manual setup key</p>
              <div className="bg-muted flex items-center gap-2 rounded p-2">
                <code className="min-w-0 flex-1 text-sm break-all">{mfaSetup.manualSecret}</code>
                <div className="group relative shrink-0">
                  <Button
                    aria-label={
                      manualKeyCopied ? 'Copied manual setup key' : 'Copy manual setup key'
                    }
                    onClick={() => void copyManualSetupKey()}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {manualKeyCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                  <span
                    className="bg-popover text-popover-foreground pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-md border px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    role="tooltip"
                  >
                    {manualKeyCopied ? 'Copied' : 'Copy'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={submitMfa}>
            {!enrollment && mfaChallenge.methods.includes('RECOVERY_CODE') ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => setMfaMethod('TOTP')}
                  type="button"
                  variant={mfaMethod === 'TOTP' ? 'default' : 'outline'}
                >
                  Authenticator code
                </Button>
                <Button
                  onClick={() => setMfaMethod('RECOVERY_CODE')}
                  type="button"
                  variant={mfaMethod === 'RECOVERY_CODE' ? 'default' : 'outline'}
                >
                  Recovery code
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="mfa-code">
                {mfaMethod === 'TOTP' ? 'Six-digit code' : 'Recovery code'}
              </Label>
              <Input
                autoComplete="one-time-code"
                disabled={mfaBusy || (enrollment && mfaSetup === null)}
                id="mfa-code"
                inputMode={mfaMethod === 'TOTP' ? 'numeric' : 'text'}
                onChange={(event) => setMfaCode(event.target.value)}
                required
                value={mfaCode}
              />
            </div>
            {mfaError ? (
              <Alert variant="destructive">
                <ShieldAlert />
                <AlertTitle>Verification failed</AlertTitle>
                <AlertDescription>{mfaError}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              className="w-full"
              disabled={mfaBusy || (enrollment && mfaSetup === null)}
              size="lg"
              type="submit"
            >
              {mfaBusy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              {enrollment ? 'Finish secure setup' : 'Verify and sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Use the employee account issued by Go Digital or your client administrator.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <GoogleIdentityButton
          createChallenge={auth.createGoogleLoginChallenge}
          disabled={restoring}
          onCredential={signInWithGoogle}
          onFailure={(error) => setGoogleError(googleLoginErrorMessage(error))}
        />

        {googleError === null ? null : (
          <Alert variant="destructive">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>{googleError.title}</AlertTitle>
            <AlertDescription>{googleError.description}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3" role="separator">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-xs font-medium uppercase">Or use email</span>
          <Separator className="flex-1" />
        </div>

        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
        >
          <div className="space-y-2">
            <Label htmlFor="login-email">Email address</Label>
            <Input
              aria-describedby="login-email-error"
              aria-invalid={form.formState.errors.email !== undefined}
              autoComplete="email"
              disabled={form.formState.isSubmitting || restoring}
              id="login-email"
              inputMode="email"
              type="email"
              {...form.register('email')}
            />
            <FieldError id="login-email-error" message={form.formState.errors.email?.message} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="login-password">Password</Label>
              <Link
                className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                aria-describedby="login-password-error"
                aria-invalid={form.formState.errors.password !== undefined}
                autoComplete="current-password"
                className="pr-11"
                disabled={form.formState.isSubmitting || restoring}
                id="login-password"
                type={passwordVisible ? 'text' : 'password'}
                {...form.register('password')}
              />
              <Button
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 h-full w-10 px-0"
                disabled={form.formState.isSubmitting || restoring}
                onClick={() => setPasswordVisible((visible) => !visible)}
                type="button"
                variant="ghost"
              >
                {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            <FieldError
              id="login-password-error"
              message={form.formState.errors.password?.message}
            />
          </div>

          {serverError === undefined ? null : (
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={form.formState.isSubmitting || restoring}
            size="lg"
            type="submit"
          >
            {form.formState.isSubmitting || restoring ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <KeyRound aria-hidden="true" data-icon="inline-start" />
            )}
            {restoring
              ? 'Checking existing session'
              : form.formState.isSubmitting
                ? 'Signing in'
                : 'Sign in securely'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message === undefined ? null : (
    <p className="text-destructive text-xs leading-5" id={id} role="alert">
      {message}
    </p>
  );
}
