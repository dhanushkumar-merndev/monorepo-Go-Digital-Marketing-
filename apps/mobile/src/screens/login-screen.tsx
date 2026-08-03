import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { GoogleSignInButton } from 'react-native-nitro-google-signin';

import { Alert, AppText, Badge, Button, Card, Screen, TextField } from '../components/ui';
import { useAuth } from '../auth/auth-provider';
import type { LoginInput } from '../auth/auth-types';
import { useAuthStore } from '../store/auth-store';

export interface LoginFormProps {
  googleAvailable?: boolean;
  loading: boolean;
  onGoogleLogin?(): Promise<void>;
  message?: string;
  onLogin(input: LoginInput): Promise<void>;
}

interface LoginErrors {
  email?: string;
  password?: string;
}

export function validateLoginInput(input: LoginInput): LoginErrors {
  const errors: LoginErrors = {};
  const email = input.email.trim();

  if (!/^\S+@\S+\.\S+$/u.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (input.password.length === 0) {
    errors.password = 'Enter your password.';
  }

  return errors;
}

export function LoginForm({
  googleAvailable = false,
  loading,
  message,
  onGoogleLogin,
  onLogin,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});

  const submit = async (): Promise<void> => {
    const input = { email, password };
    const nextErrors = validateLoginInput(input);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      AccessibilityInfo.announceForAccessibility('Check the sign-in form for errors.');
      return;
    }

    await onLogin(input);
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-3">
        <Badge label="Secure mobile access" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Sign in to Go Digital CRM
        </AppText>
        <AppText tone="muted">
          Mobile access is limited to assigned sales, test ride and delivery field roles.
        </AppText>
      </View>

      {message ? <Alert description={message} title="Sign-in unavailable" tone="danger" /> : null}

      <Card>
        <GoogleSignInButton
          accessibilityLabel="Sign in with Google"
          colorScheme="light"
          disabled={loading || !googleAvailable || !onGoogleLogin}
          loading={loading}
          onPress={() => {
            void onGoogleLogin?.();
          }}
          signInBehavior="none"
          size="wide"
          style={{ height: 48, width: '100%' }}
          testID="google-sign-in-button"
        />
        {!googleAvailable ? (
          <AppText tone="muted" variant="caption">
            Google sign-in needs a configured native development or production build. Email and
            password sign-in remains available.
          </AppText>
        ) : null}

        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <AppText tone="muted" variant="caption">
            OR
          </AppText>
          <View className="h-px flex-1 bg-border" />
        </View>

        <TextField
          autoCapitalize="none"
          autoComplete="email"
          editable={!loading}
          {...(errors.email ? { error: errors.email } : {})}
          inputMode="email"
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          returnKeyType="next"
          textContentType="username"
          value={email}
        />
        <TextField
          autoCapitalize="none"
          autoComplete="current-password"
          editable={!loading}
          {...(errors.password ? { error: errors.password } : {})}
          label="Password"
          onChangeText={setPassword}
          onSubmitEditing={() => {
            void submit();
          }}
          returnKeyType="done"
          secureTextEntry
          textContentType="password"
          value={password}
        />
        <Button
          label="Sign in"
          loading={loading}
          onPress={() => {
            void submit();
          }}
        />
      </Card>

      <Alert
        description="Your access is determined by the active server-issued membership. The app never trusts a typed dealership identifier."
        title="Tenant-safe sign-in"
        tone="neutral"
      />
    </Screen>
  );
}

export function LoginScreen() {
  const { googleAvailable, login, loginWithGoogle } = useAuth();
  const message = useAuthStore((state) => state.message);
  const loading = useAuthStore((state) => state.status === 'authenticating');

  return (
    <LoginForm
      googleAvailable={googleAvailable}
      loading={loading}
      {...(message ? { message } : {})}
      onGoogleLogin={loginWithGoogle}
      onLogin={login}
    />
  );
}
