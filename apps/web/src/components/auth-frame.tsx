import type { ReactNode } from 'react';

import { AuthLoginAnimation } from './auth-login-animation';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[55%_45%]">
      <section className="bg-primary text-primary-foreground relative hidden overflow-hidden p-10 lg:flex lg:min-h-screen lg:flex-col">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_25%_20%,white_0,transparent_38%),radial-gradient(circle_at_75%_85%,white_0,transparent_42%)] opacity-15" />
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
        <div className="relative -mx-6 flex w-auto flex-1 items-end justify-center pt-2">
          <AuthLoginAnimation />
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
