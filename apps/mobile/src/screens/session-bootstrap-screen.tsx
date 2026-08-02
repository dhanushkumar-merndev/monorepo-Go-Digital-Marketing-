import { Screen, StatePanel } from '../components/ui';

export function SessionBootstrapScreen() {
  return (
    <Screen contentContainerStyle={{ flex: 1, justifyContent: 'center' }}>
      <StatePanel
        description="Checking the secure session and assigned mobile role."
        state="loading"
        title="Opening Go Digital CRM"
      />
    </Screen>
  );
}
