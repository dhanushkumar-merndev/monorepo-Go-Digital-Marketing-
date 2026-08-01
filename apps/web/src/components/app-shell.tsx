import { StatusBadge } from '@gdm/ui/components/status-badge';
import { CarFront, LayoutDashboard, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl shadow-[var(--shadow-sm)]"
      >
        <CarFront className="size-5" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">Go Digital</span>
        <span className="text-muted-foreground block truncate text-xs">Automobile CRM</span>
      </span>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="bg-muted/35 min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        className="bg-background sr-only z-50 rounded-md px-4 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        href="#main-content"
      >
        Skip to main content
      </a>

      <aside className="border-border bg-card hidden min-h-screen border-e md:flex md:flex-col">
        <div className="border-border border-b px-5 py-5">
          <Brand />
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-5">
          <Link
            aria-current="page"
            className="bg-primary/10 text-primary hover:bg-primary/15 focus-visible:ring-ring flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
            href="/"
          >
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Foundation
          </Link>
        </nav>

        <div className="border-border border-t p-4">
          <div className="bg-muted text-muted-foreground flex items-start gap-3 rounded-lg px-3 py-3 text-xs">
            <ShieldCheck aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
            <p>Server authorization remains authoritative as protected modules are added.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="md:hidden">
              <Brand />
            </div>
            <p className="hidden text-sm font-medium md:block">Architecture foundation</p>
            <StatusBadge tone="info">Phase 0</StatusBadge>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
