import { Pressable, Text } from 'react-native';

interface MockGoogleButtonProps {
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress?(): void;
  testID?: string;
}

export const GoogleOneTapSignIn = {
  checkPlayServices: jest.fn(async () => undefined),
  configure: jest.fn(),
  createAccount: jest.fn(async () => ({ data: null, type: 'cancelled' })),
  presentExplicitSignIn: jest.fn(async () => ({ data: null, type: 'cancelled' })),
  signIn: jest.fn(async () => ({ data: null, type: 'cancelled' })),
  signOut: jest.fn(async () => undefined),
};

export function GoogleSignInButton({
  accessibilityLabel = 'Sign in with Google',
  disabled = false,
  loading = false,
  onPress,
  testID,
}: MockGoogleButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Text>Sign in with Google</Text>
    </Pressable>
  );
}
