'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { CheckCircle2, KeyRound, LoaderCircle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';

import { ApiClientError } from './auth-api-client';
import { useAuth } from './auth-provider';

const resetSchema = z
  .object({
    confirmPassword: z.string(),
    password: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Use no more than 128 characters.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const auth = useAuth();
  const [complete, setComplete] = useState(false);
  const form = useForm<ResetFormValues>({
    defaultValues: { confirmPassword: '', password: '' },
    resolver: zodResolver(resetSchema),
  });

  async function submit(values: ResetFormValues) {
    form.clearErrors('root');
    try {
      await auth.resetPassword({ password: values.password, token });
      setComplete(true);
    } catch (caught) {
      const error = caught instanceof ApiClientError ? caught : null;
      form.setError('root', {
        message:
          error?.code === 'PASSWORD_RESET_TOKEN_INVALID' ||
          error?.code === 'PASSWORD_RESET_TOKEN_EXPIRED'
            ? 'This reset link is invalid or has expired. Request a new link.'
            : (error?.message ?? 'The password could not be reset. Try again.'),
      });
    }
  }

  if (token.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reset link required</CardTitle>
          <CardDescription>
            This page needs the one-time token from your password reset email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={buttonVariants({ className: 'w-full' })} href="/forgot-password">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (complete) {
    return (
      <Card>
        <CardHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-full bg-[var(--status-success-background)] text-[var(--status-success-foreground)]">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </span>
          <CardTitle>Password changed</CardTitle>
          <CardDescription>
            Your password has been reset. Existing sessions have been invalidated for your safety.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={buttonVariants({ className: 'w-full' })} href="/login">
            Sign in with new password
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Use a unique password of at least 12 characters. Do not reuse a dealership or email
          password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
          <PasswordField
            autoComplete="new-password"
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.password?.message}
            id="reset-password"
            label="New password"
            registration={form.register('password')}
          />
          <PasswordField
            autoComplete="new-password"
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.confirmPassword?.message}
            id="reset-password-confirm"
            label="Confirm new password"
            registration={form.register('confirmPassword')}
          />

          {form.formState.errors.root?.message === undefined ? null : (
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>Password was not changed</AlertTitle>
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <KeyRound aria-hidden="true" data-icon="inline-start" />
            )}
            {form.formState.isSubmitting ? 'Changing password' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordField({
  autoComplete,
  disabled,
  error,
  id,
  label,
  registration,
}: {
  autoComplete: string;
  disabled: boolean;
  error: string | undefined;
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={`${id}-error`}
        aria-invalid={error !== undefined}
        autoComplete={autoComplete}
        disabled={disabled}
        id={id}
        type="password"
        {...registration}
      />
      {error === undefined ? null : (
        <p className="text-destructive text-xs" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
