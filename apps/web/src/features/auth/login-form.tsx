'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Separator } from '@gdm/ui/components/separator';
import { KeyRound, LoaderCircle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiClientError } from './auth-api-client';
import { googleLoginErrorMessage, type AuthenticationErrorMessage } from './google-auth-errors';
import { GoogleIdentityButton } from './google-identity-services';
import { useAuth } from './auth-provider';
import type { GoogleCredentialInput } from './auth-types';
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
  const form = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  });
  const serverError = form.formState.errors.root?.message;
  const restoring = auth.status === 'loading';

  useEffect(() => {
    if (auth.status === 'authenticated') router.replace(returnTo);
  }, [auth.status, returnTo, router]);

  async function submit(values: LoginFormValues) {
    form.clearErrors('root');
    setGoogleError(null);
    try {
      await auth.login(values, returnTo);
    } catch (caught) {
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
    setGoogleError(null);
    await auth.loginWithGoogle(input, returnTo);
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

        <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
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
            <Input
              aria-describedby="login-password-error"
              aria-invalid={form.formState.errors.password !== undefined}
              autoComplete="current-password"
              disabled={form.formState.isSubmitting || restoring}
              id="login-password"
              type="password"
              {...form.register('password')}
            />
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
