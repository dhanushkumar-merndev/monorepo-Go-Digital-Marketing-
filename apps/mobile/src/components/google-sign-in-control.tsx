import { Button } from './ui';

/** Type-checking and non-native fallback; Metro selects the native implementation on Android/iOS. */
export function GoogleSignInControl({
  disabled,
}: {
  disabled: boolean;
  loading: boolean;
  onPress(): void;
}) {
  return <Button disabled={disabled} label="Sign in with Google" />;
}
