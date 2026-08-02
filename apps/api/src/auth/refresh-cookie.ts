import type { Request, Response } from 'express';
import type { AuthRuntimeConfig } from './auth-runtime-config.js';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(';').flatMap((item) => {
      const separator = item.indexOf('=');

      if (separator <= 0) {
        return [];
      }

      const name = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();

      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function readRefreshCookie(request: Request, config: AuthRuntimeConfig): string | undefined {
  return parseCookies(request.headers.cookie)[config.cookieName];
}

export function setRefreshCookie(
  response: Response,
  config: AuthRuntimeConfig,
  token: string,
  expiresAt: string,
): void {
  response.cookie(config.cookieName, token, {
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    expires: new Date(expiresAt),
    httpOnly: true,
    path: '/v1/auth',
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
  });
}

export function clearRefreshCookie(response: Response, config: AuthRuntimeConfig): void {
  response.clearCookie(config.cookieName, {
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    httpOnly: true,
    path: '/v1/auth',
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
  });
}
