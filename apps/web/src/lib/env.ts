import { parseWebEnvironment } from '@gdm/config/web';

const parsedEnvironment = parseWebEnvironment({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

export const publicEnvironment = {
  apiBaseUrl: parsedEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, ''),
  googleClientId: parsedEnvironment.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  supabasePublishableKey: parsedEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  supabaseUrl: parsedEnvironment.NEXT_PUBLIC_SUPABASE_URL ?? '',
} as const;
