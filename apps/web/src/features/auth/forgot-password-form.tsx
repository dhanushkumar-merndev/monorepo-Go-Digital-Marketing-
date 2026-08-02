'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { ArrowLeft, CheckCircle2, LoaderCircle, Mail, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiClientError } from './auth-api-client';
import { useAuth } from './auth-provider';

const forgotSchema = z.object({ email: z.string().trim().email('Enter a valid email address.') });
type ForgotFormValues = z.infer<typeof forgotSchema>;

export function ForgotPasswordForm() {
  const auth = useAuth();
  const [accepted, setAccepted] = useState(false);
  const form = useForm<ForgotFormValues>({
    defaultValues: { email: '' },
    resolver: zodResolver(forgotSchema),
  });

  async function submit(values: ForgotFormValues) {
    form.clearErrors('root');
    try {
      await auth.requestPasswordReset(values.email);
      setAccepted(true);
    } catch (caught) {
      form.setError('root', {
        message:
          caught instanceof ApiClientError
            ? caught.message
            : 'The reset request could not be submitted. Try again.',
      });
    }
  }

  if (accepted) {
    return (
      <Card>
        <CardHeader>
          <span className="mb-2 grid size-11 place-items-center rounded-full bg-[var(--status-success-background)] text-[var(--status-success-foreground)]">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </span>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an active account matches that address, password reset instructions have been sent.
            For security, this page does not confirm whether an account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={buttonVariants({ className: 'w-full' })} href="/login">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Return to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your employee email. Reset links are short-lived and can be used only once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email address</Label>
            <Input
              aria-describedby="forgot-email-error"
              aria-invalid={form.formState.errors.email !== undefined}
              autoComplete="email"
              disabled={form.formState.isSubmitting}
              id="forgot-email"
              inputMode="email"
              type="email"
              {...form.register('email')}
            />
            {form.formState.errors.email?.message === undefined ? null : (
              <p className="text-destructive text-xs" id="forgot-email-error" role="alert">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {form.formState.errors.root?.message === undefined ? null : (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Request unavailable</AlertTitle>
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <Mail aria-hidden="true" data-icon="inline-start" />
            )}
            {form.formState.isSubmitting ? 'Submitting request' : 'Send reset instructions'}
          </Button>
          <Link
            className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 text-sm"
            href="/login"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
