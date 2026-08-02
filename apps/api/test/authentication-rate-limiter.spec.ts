import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import {
  AuthenticationRateLimiter,
  type AuthenticationRateLimitStore,
} from '../src/auth/authentication-rate-limiter.js';

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body
    ? String(body.code)
    : undefined;
}

describe('AuthenticationRateLimiter', () => {
  it('enforces a bounded local fallback even when Redis is unavailable', async () => {
    const unavailableStore: AuthenticationRateLimitStore = {
      consume: () => Promise.reject(new Error('Redis unavailable')),
    };
    const limiter = new AuthenticationRateLimiter(unavailableStore);

    await limiter.assertAllowed('login', '127.0.0.1', 2, 60_000);
    await limiter.assertAllowed('login', '127.0.0.1', 2, 60_000);
    await assert.rejects(
      limiter.assertAllowed('login', '127.0.0.1', 2, 60_000),
      (error: unknown) => errorCode(error) === 'RATE_LIMITED',
    );
  });

  it('honors a distributed denial across API instances', async () => {
    const deniedStore: AuthenticationRateLimitStore = {
      consume: () => Promise.resolve(false),
    };
    const limiter = new AuthenticationRateLimiter(deniedStore);

    await assert.rejects(
      limiter.assertAllowed('reset', '127.0.0.2', 10, 60_000),
      (error: unknown) => errorCode(error) === 'RATE_LIMITED',
    );
  });
});
