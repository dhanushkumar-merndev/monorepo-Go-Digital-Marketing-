import { ForbiddenException } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import type { Request } from 'express';

function normalizedOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Cookie-backed auth commands must prove they originated from an explicitly
 * configured web client. CORS alone does not prevent a browser from sending a
 * cross-site request, so this is also checked server-side before token work.
 */
export function assertTrustedBrowserOrigin(
  request: Request,
  environment: Pick<ApiEnvironment, 'corsOrigins'>,
): void {
  const requestOrigin = request.headers.origin
    ? normalizedOrigin(request.headers.origin)
    : undefined;
  const allowed = environment.corsOrigins.some(
    (origin) => normalizedOrigin(origin) === requestOrigin,
  );

  if (!requestOrigin || !allowed) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'The browser request origin is not allowed.',
      retryable: false,
    });
  }
}
