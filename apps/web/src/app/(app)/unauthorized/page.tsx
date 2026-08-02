import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { buttonVariants } from '@gdm/ui/components/button';
import { ArrowLeft, ShieldX } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Unauthorized' };

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--status-danger-background)] text-[var(--status-danger-foreground)]">
        <ShieldX aria-hidden="true" className="size-7" />
      </span>
      <p className="text-destructive mt-5 text-sm font-semibold">403</p>
      <h1 className="mt-2 text-2xl font-semibold">You do not have permission</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        Your identity is valid, but the current membership or scope does not allow this action.
        Changing the visible UI cannot grant backend access.
      </p>
      <Alert className="mt-6 text-left" variant="info">
        <ShieldX aria-hidden="true" />
        <AlertTitle>Need access?</AlertTitle>
        <AlertDescription>
          Ask your client administrator or manager to review your role, branch, team and assignment
          scope.
        </AlertDescription>
      </Alert>
      <Link className={buttonVariants({ className: 'mt-6' })} href="/">
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        Return to overview
      </Link>
    </div>
  );
}
