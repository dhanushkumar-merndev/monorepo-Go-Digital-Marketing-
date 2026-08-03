const googleClientIdPattern = /^[a-z0-9-]+\.apps\.googleusercontent\.com$/iu;

export type MobileNativePlatform = 'android' | 'ios';

export interface MobileGoogleAuthConfiguration {
  available: boolean;
  iosClientId?: string;
  unavailableReason?: string;
  webClientId?: string;
}

function optionalGoogleClientId(value: unknown, variableName: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !googleClientIdPattern.test(value.trim())) {
    throw new Error(`${variableName} must be a Google OAuth client ID`);
  }

  return value.trim();
}

export function mobileGoogleAuthConfiguration(
  environment: Record<string, unknown>,
  platform: MobileNativePlatform,
): MobileGoogleAuthConfiguration {
  const webClientId = optionalGoogleClientId(
    environment.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  );
  const iosClientId = optionalGoogleClientId(
    environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  );
  if (!webClientId) {
    return {
      available: false,
      unavailableReason: 'Google sign-in is not configured for this app build.',
    };
  }

  if (platform === 'ios' && !iosClientId) {
    return {
      available: false,
      unavailableReason: 'Google sign-in is not configured for this iOS app build.',
      webClientId,
    };
  }

  return {
    available: true,
    ...(iosClientId ? { iosClientId } : {}),
    webClientId,
  };
}
