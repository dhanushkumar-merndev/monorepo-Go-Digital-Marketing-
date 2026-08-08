import { Suspense } from 'react';

import { UnifiedInbox } from '@/features/messaging/unified-inbox';

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <UnifiedInbox />
    </Suspense>
  );
}
