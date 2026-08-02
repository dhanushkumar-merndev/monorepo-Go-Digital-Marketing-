import { Button, Screen, StatePanel } from '../components/ui';
import { useAuth } from '../auth/auth-provider';
import { useAuthStore } from '../store/auth-store';

export function UnsupportedRoleScreen() {
  const { resetForAnotherAccount } = useAuth();
  const message = useAuthStore((state) => state.message);

  return (
    <Screen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <StatePanel
        description={
          message ?? 'Use the office web dashboard, or sign in with an assigned mobile field role.'
        }
        state="empty"
        title="This role is not available on mobile"
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
