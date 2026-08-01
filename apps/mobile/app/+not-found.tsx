import { useRouter } from 'expo-router';

import { Button, Screen, StatePanel } from '../src/components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen contentContainerStyle={{ flex: 1, justifyContent: 'center' }}>
      <StatePanel
        description="This mobile route is not part of the current release."
        state="empty"
        title="Screen not found"
      />
      <Button label="Return home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
