import { Button, Screen, StatePanel } from '../components/ui';
import { useAuth } from '../auth/auth-provider';
import { useAuthStore } from '../store/auth-store';

const reasonTitle = {
  CLIENT_SUSPENDED: 'Dealership access is disabled',
  MEMBERSHIP_INACTIVE: 'Membership is inactive',
  USER_SUSPENDED: 'Account is disabled',
} as const;

export function DisabledAccountScreen() {
  const { resetForAnotherAccount } = useAuth();
  const disabledReason = useAuthStore((state) => state.disabledReason);
  const message = useAuthStore((state) => state.message);

  return (
    <Screen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <StatePanel
        description={message ?? 'Contact your administrator before trying this account again.'}
        state="error"
        title={disabledReason ? reasonTitle[disabledReason] : 'Access is disabled'}
      />
      <Button
        label="Use another account"
        onPress={() => {
          void resetForAnotherAccount();
        }}
        variant="secondary"
      />
    </Screen>
  );
}
