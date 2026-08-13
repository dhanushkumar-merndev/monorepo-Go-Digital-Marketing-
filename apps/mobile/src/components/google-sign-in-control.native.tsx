import { GoogleSignInButton } from 'react-native-nitro-google-signin';

export function GoogleSignInControl({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress(): void;
}) {
  return (
    <GoogleSignInButton
      accessibilityLabel="Sign in with Google"
      colorScheme="light"
      disabled={disabled}
      loading={loading}
      onPress={onPress}
      signInBehavior="none"
      size="wide"
      style={{ height: 48, width: '100%' }}
      testID="google-sign-in-button"
    />
  );
}
