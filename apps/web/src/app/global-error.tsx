'use client';

import { Button } from '@gdm/ui/components/button';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { reportClientError } from '@/lib/client-error-reporter';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    reportClientError(
      error,
      error.digest === undefined
        ? { boundary: 'root' }
        : { boundary: 'root', digest: error.digest },
    );
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="bg-background text-foreground grid min-h-screen place-items-center p-6">
          <div className="border-border bg-card w-full max-w-lg rounded-xl border p-6 shadow-[var(--shadow-md)]">
            <TriangleAlert aria-hidden="true" className="text-destructive size-6" />
            <h1 className="mt-4 text-xl font-semibold">
              The application shell encountered an error
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              No data was changed. Retry the application shell, or contact support if the problem
              continues.
            </p>
            <Button className="mt-6" onClick={reset}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Retry
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
