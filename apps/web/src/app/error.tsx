'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { reportClientError } from '@/lib/client-error-reporter';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    reportClientError(
      error,
      error.digest === undefined ? { boundary: 'app' } : { boundary: 'app', digest: error.digest },
    );
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>The dashboard could not be displayed</AlertTitle>
        <AlertDescription>
          The error was contained. Try loading this section again; contact support with the request
          reference if the issue persists.
        </AlertDescription>
      </Alert>
      <Button onClick={reset}>
        <RefreshCw aria-hidden="true" data-icon="inline-start" />
        Try again
      </Button>
    </div>
  );
}
