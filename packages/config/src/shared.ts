import { z } from 'zod';

export const publicApiUrlSchema = z
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'API URL must use http:// or https://' });
    }

    if (url.username || url.password) {
      context.addIssue({ code: 'custom', message: 'API URL must not contain credentials' });
    }

    if (url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'API URL must not contain a query or fragment' });
    }

    if (url.pathname !== '/v1' && url.pathname !== '/v1/') {
      context.addIssue({ code: 'custom', message: 'API URL path must be /v1' });
    }
  })
  .transform((value) => value.replace(/\/$/u, ''));

export const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());
