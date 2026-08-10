import type { Request } from 'express';
import type { DevicePlatform } from '@gdm/contracts';
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

export function browserDeviceMetadata(request: Request): {
  deviceName: string;
  devicePlatform: DevicePlatform;
} {
  const userAgent = request.headers['user-agent'] ?? '';
  const browserBrands = request.headers['sec-ch-ua'];
  const brands = Array.isArray(browserBrands) ? browserBrands.join(' ') : (browserBrands ?? '');
  const browser = /Brave/iu.test(brands)
    ? 'Brave'
    : /Edg\//iu.test(userAgent)
      ? 'Edge'
      : /OPR\//iu.test(userAgent)
        ? 'Opera'
        : /Firefox\//iu.test(userAgent)
          ? 'Firefox'
          : /Chrome\/|CriOS\//iu.test(userAgent)
            ? 'Chrome'
            : /Safari\//iu.test(userAgent)
              ? 'Safari'
              : 'Web browser';
  const operatingSystem = /Android/iu.test(userAgent)
    ? 'Android'
    : /iPhone/iu.test(userAgent)
      ? 'iPhone'
      : /iPad/iu.test(userAgent)
        ? 'iPad'
        : /Windows NT/iu.test(userAgent)
          ? 'Windows'
          : /CrOS/iu.test(userAgent)
            ? 'ChromeOS'
            : /Mac OS X/iu.test(userAgent)
              ? 'macOS'
              : /Linux/iu.test(userAgent)
                ? 'Linux'
                : undefined;
  const devicePlatform: DevicePlatform = /Android/iu.test(userAgent)
    ? 'android'
    : /iPhone|iPad|iPod/iu.test(userAgent)
      ? 'ios'
      : 'web';

  return {
    deviceName: operatingSystem ? `${browser} on ${operatingSystem}` : browser,
    devicePlatform,
  };
}
