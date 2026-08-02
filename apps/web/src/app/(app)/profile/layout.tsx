import type { ReactNode } from 'react';

import { PermissionGate } from '@/features/auth/permission-gate';

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <PermissionGate permission="account.profile.read">{children}</PermissionGate>;
}
