import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { Boxes, CircleCheck, Info, Palette, ShieldCheck } from 'lucide-react';

import { FoundationStatus } from '@/components/foundation-status';

const foundationCapabilities = [
  'Next.js App Router with strict TypeScript',
  'Project-owned shadcn primitives pinned to Base UI',
  'Shared semantic tokens for web and mobile parity',
  'TanStack Query with explicit request states',
] as const;

export default function FoundationPage() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="foundation-heading" className="space-y-4">
        <Badge variant="secondary">Architecture foundation</Badge>
        <div className="max-w-3xl space-y-3">
          <h1
            className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            id="foundation-heading"
          >
            The office dashboard shell is ready for phased delivery.
          </h1>
          <p className="text-muted-foreground text-base leading-7 sm:text-lg">
            Phase 0 establishes the application boundary, accessible navigation, shared design
            language, and observable API connectivity without introducing dealership workflows.
          </p>
        </div>
      </section>

      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertTitle>Foundation scope only</AlertTitle>
        <AlertDescription>
          Lead, inventory, booking, delivery, registration, and other dealership workflows are
          intentionally deferred to their assigned phases.
        </AlertDescription>
      </Alert>

      <section aria-labelledby="platform-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" id="platform-heading">
              Platform status
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Static foundation capabilities and a live API connectivity check.
            </p>
          </div>
          <StatusBadge tone="neutral">No production integrations shown</StatusBadge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes aria-hidden="true" className="text-primary size-4" />
                Web foundation
              </CardTitle>
              <CardDescription>
                Reusable controls stay in the shared web-only UI package.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {foundationCapabilities.map((capability) => (
                  <li className="flex items-start gap-3 text-sm leading-6" key={capability}>
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-[var(--status-success-foreground)]"
                    />
                    <span>{capability}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <FoundationStatus />
        </div>
      </section>

      <section aria-labelledby="guardrails-heading" className="space-y-4">
        <h2 className="text-xl font-semibold" id="guardrails-heading">
          Foundation guardrails
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="text-primary size-4" />
                Server authority
              </CardTitle>
              <CardDescription>
                The dashboard is a presentation client. Authorization and business transitions
                remain owned by the NestJS API.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette aria-hidden="true" className="text-primary size-4" />
                Shared visual language
              </CardTitle>
              <CardDescription>
                Web components consume semantic tokens also available to mobile, while web-only
                shadcn code stays isolated in @gdm/ui.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}
