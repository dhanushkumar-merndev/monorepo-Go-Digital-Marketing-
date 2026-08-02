'use client';

import { Skeleton } from '@gdm/ui/components/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from './auth-provider';
import { hasPermission } from './auth-types';

export function PermissionGate({
  children,
  permission,
}: {
  children: ReactNode;
  permission: string;
}) {
  const auth = useAuth();
  const router = useRouter();
  const allowed = auth.session !== null && hasPermission(auth.session, permission);

  useEffect(() => {
    if (auth.status === 'authenticated' && !allowed) router.replace('/unauthorized');
  }, [allowed, auth.status, router]);

  if (!allowed) {
    return (
      <div aria-busy="true" aria-label="Checking page permission" className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  return children;
}
