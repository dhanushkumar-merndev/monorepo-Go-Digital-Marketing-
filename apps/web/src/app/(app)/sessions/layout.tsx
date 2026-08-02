import type { ReactNode } from 'react';

import { PermissionGate } from '@/features/auth/permission-gate';

export default function SessionsLayout({ children }: { children: ReactNode }) {
  return <PermissionGate permission="account.sessions.read">{children}</PermissionGate>;
}
