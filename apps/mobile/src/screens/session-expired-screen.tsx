import { useState } from 'react';

import { Alert, Button, Screen, StatePanel } from '../components/ui';
import { useAuth } from '../auth/auth-provider';
import { useAuthStore } from '../store/auth-store';

export function SessionExpiredScreen() {
  const { resetForAnotherAccount, retrySession } = useAuth();
  const message = useAuthStore((state) => state.message);
  const [retrying, setRetrying] = useState(false);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    try {
      await retrySession();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Screen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <StatePanel
        description={message ?? 'Your access token is no longer valid. Refresh or sign in again.'}
        state="error"
        title="Session needs attention"
      />
      <Button
        label="Retry secure refresh"
        loading={retrying}
        onPress={() => {
          void retry();
        }}
      />
      <Button
        disabled={retrying}
        label="Sign in again"
        onPress={() => {
          void resetForAnotherAccount();
        }}
        variant="secondary"
      />
      <Alert
        description="A network failure does not delete a valid refresh token. Revoked, reused or disabled sessions are removed immediately."
        title="Secure recovery"
        tone="neutral"
      />
    </Screen>
  );
}
