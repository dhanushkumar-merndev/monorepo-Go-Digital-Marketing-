import { Suspense } from 'react';

import { LoginForm } from '@/features/auth/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Preparing secure sign in…</p>}>
      <LoginForm />
    </Suspense>
  );
}
