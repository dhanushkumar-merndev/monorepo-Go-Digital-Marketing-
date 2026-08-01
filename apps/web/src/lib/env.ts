import { parseWebEnvironment } from '@gdm/config/web';

const parsedEnvironment = parseWebEnvironment({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

export const publicEnvironment = {
  apiBaseUrl: parsedEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
} as const;
