import { parseWebEnvironment } from '@gdm/config/web';

const parsedEnvironment = parseWebEnvironment({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
});

export const publicEnvironment = {
  apiBaseUrl: parsedEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
  googleClientId: parsedEnvironment.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
} as const;
