import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { RootProviders } from '../src/providers/root-providers';
import { nativeTheme } from '../src/theme/native-theme';

export default function RootLayout() {
  return (
    <RootProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: nativeTheme.colors.background },
          headerShown: false,
        }}
      />
    </RootProviders>
  );
}
