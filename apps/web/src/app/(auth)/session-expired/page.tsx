import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { ClockAlert, UserX } from 'lucide-react';

import { ClearSessionSignInButton } from '@/features/auth/clear-session-sign-in-button';
import { safeReturnPath } from '@/features/auth/safe-return-path';

export const metadata = { title: 'Session ended' };

export default async function SessionExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[]; returnTo?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const returnTo = safeReturnPath(
    typeof parameters.returnTo === 'string' ? parameters.returnTo : undefined,
  );
  const disabled = parameters.reason === 'disabled';
  const loginHref = returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Card>
      <CardHeader>
        <span className="bg-muted text-muted-foreground mb-2 grid size-11 place-items-center rounded-full">
          {disabled ? (
            <UserX aria-hidden="true" className="size-5" />
          ) : (
            <ClockAlert aria-hidden="true" className="size-5" />
          )}
        </span>
        <CardTitle>{disabled ? 'Account access disabled' : 'Your session has ended'}</CardTitle>
        <CardDescription>
          {disabled
            ? 'Your account, membership, or client workspace is no longer active. Contact an administrator before trying again.'
            : 'The secure refresh session expired or was revoked. Sign in again to continue; unsaved form data may need to be re-entered.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant={disabled ? 'destructive' : 'info'}>
          {disabled ? <UserX aria-hidden="true" /> : <ClockAlert aria-hidden="true" />}
          <AlertTitle>
            {disabled ? 'Access blocked by server policy' : 'No protected data is displayed'}
          </AlertTitle>
          <AlertDescription>
            {disabled
              ? 'Signing in or refreshing cannot bypass a suspended account or inactive membership.'
              : 'The local access token and cached protected queries have been cleared.'}
          </AlertDescription>
        </Alert>
        <ClearSessionSignInButton
          href={loginHref}
          label={disabled ? 'Return to sign in' : 'Sign in again'}
        />
      </CardContent>
    </Card>
  );
}
