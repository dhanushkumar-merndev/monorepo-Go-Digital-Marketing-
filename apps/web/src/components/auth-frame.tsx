import { CarFront, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="bg-muted/35 grid min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
      <section className="bg-primary text-primary-foreground relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_25%_20%,white_0,transparent_38%),radial-gradient(circle_at_75%_85%,white_0,transparent_42%)] opacity-15" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <CarFront aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="font-semibold">Go Digital</p>
            <p className="text-sm text-white/75">Automobile CRM</p>
          </div>
        </div>
        <div className="relative max-w-xl space-y-5">
          <p className="text-sm font-semibold tracking-wide text-white/75 uppercase">
            Secure operations
          </p>
          <h1 className="text-4xl leading-tight font-semibold text-balance">
            One accountable workspace for every dealership team.
          </h1>
          <p className="text-base leading-7 text-white/80">
            Identity, client membership, branch scope and permissions are verified by the Go Digital
            API on every protected request.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-white/80">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Refresh credentials remain in a secure HttpOnly cookie.
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-xl">
              <CarFront aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Go Digital</p>
              <p className="text-muted-foreground text-xs">Automobile CRM</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
