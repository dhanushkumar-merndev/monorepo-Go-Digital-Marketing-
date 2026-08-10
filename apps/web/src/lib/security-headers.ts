interface SecurityHeader {
  key: string;
  value: string;
}

function apiOrigin(apiUrl: string | undefined): string | undefined {
  if (!apiUrl) return undefined;
  try {
    const url = new URL(apiUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function buildWebSecurityHeaders(
  nodeEnvironment: string | undefined,
  publicApiUrl: string | undefined,
  publicSupabaseUrl?: string | undefined,
): SecurityHeader[] {
  const hosted = nodeEnvironment === 'staging' || nodeEnvironment === 'production';
  const connectSources = [
    "'self'",
    'https://accounts.google.com',
    apiOrigin(publicApiUrl),
    apiOrigin(publicSupabaseUrl),
  ].filter((source): source is string => Boolean(source));
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(hosted ? [] : ["'unsafe-eval'"]),
    'https://accounts.google.com',
  ];
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(' ')}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'frame-src https://accounts.google.com',
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    ...(hosted ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ...(hosted
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ]
      : []),
  ];
}
