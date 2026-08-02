import { parseMobileEnvironment } from '@gdm/config/mobile';

const loopbackHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);

export function mobileApiBaseUrl(environment: Record<string, unknown>): string {
  const nodeEnvironment = environment.NODE_ENV;
  const requiresExplicitUrl = nodeEnvironment === 'production' || nodeEnvironment === 'staging';

  if (
    requiresExplicitUrl &&
    (typeof environment.EXPO_PUBLIC_API_URL !== 'string' ||
      environment.EXPO_PUBLIC_API_URL.trim().length === 0)
  ) {
    throw new Error('EXPO_PUBLIC_API_URL is required for a production mobile build');
  }

  const parsed = parseMobileEnvironment(environment);
  const url = new URL(parsed.EXPO_PUBLIC_API_URL);

  if (requiresExplicitUrl && url.protocol !== 'https:' && !loopbackHosts.has(url.hostname)) {
    throw new Error('Production mobile API traffic must use HTTPS');
  }

  return parsed.EXPO_PUBLIC_API_URL;
}
