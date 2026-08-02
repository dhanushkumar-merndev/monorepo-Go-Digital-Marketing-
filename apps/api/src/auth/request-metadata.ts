import type { Request } from 'express';
import { isIP } from 'node:net';
import {
  resolveCorrelationId,
  type CorrelatedRequest,
} from '../common/correlation/correlation-id.js';
import type { AuthRequestMetadata } from './authentication.service.js';

export function authenticationSourceIp(request: Request): string | undefined {
  // Express resolves request.ip from the socket and from X-Forwarded-For only
  // when application.ts has an explicit IP/CIDR trust-proxy allowlist.
  return request.ip && isIP(request.ip) !== 0 ? request.ip : undefined;
}

export function authenticationRequestMetadata(request: Request): AuthRequestMetadata {
  const sourceIp = authenticationSourceIp(request);
  const userAgent = request.headers['user-agent'];

  return {
    correlationId: resolveCorrelationId(request as CorrelatedRequest),
    ...(sourceIp ? { sourceIp } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
