import { Button } from './ui';

export function GoogleSignInControl({
  disabled,
}: {
  disabled: boolean;
  loading: boolean;
  onPress(): void;
}) {
  return <Button disabled={disabled} label="Sign in with Google" />;
}
