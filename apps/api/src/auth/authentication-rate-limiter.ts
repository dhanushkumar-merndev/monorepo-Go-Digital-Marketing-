import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { RedisConnectionService } from '../infrastructure/redis/redis-connection.service.js';
import { REDIS_CONNECTION } from '../infrastructure/redis/redis.tokens.js';

export const AUTH_RATE_LIMIT_STORE = Symbol('AUTH_RATE_LIMIT_STORE');

export interface AuthenticationRateLimitStore {
  consume(key: string, limit: number, windowMilliseconds: number): Promise<boolean>;
}

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class RedisAuthenticationRateLimitStore implements AuthenticationRateLimitStore {
  private client: Redis;
  private connection: Promise<void> | undefined;

  constructor(
    @Inject(REDIS_CONNECTION)
    private readonly connectionService: RedisConnectionService,
  ) {
    this.client = connectionService.createRateLimitClient();
  }

  async consume(key: string, limit: number, windowMilliseconds: number): Promise<boolean> {
    if (this.client.status === 'end') {
      this.client = this.connectionService.createRateLimitClient();
    }

    if (this.client.status !== 'ready') {
      this.connection ??= this.client.connect().finally(() => {
        this.connection = undefined;
      });
      await this.connection;
    }

    const count = await this.client.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      `gdm:auth-rate:${key}`,
      String(windowMilliseconds),
    );
    return Number(count) <= limit;
  }
}

interface LocalWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthenticationRateLimiter {
  private readonly localWindows = new Map<string, LocalWindow>();

  constructor(
    @Inject(AUTH_RATE_LIMIT_STORE)
    private readonly distributedStore: AuthenticationRateLimitStore,
  ) {}

  async assertAllowed(
    bucket: string,
    discriminator: string,
    limit: number,
    windowMilliseconds: number,
  ): Promise<void> {
    const key = createHash('sha256')
      .update(`${bucket}\u0000${discriminator}`, 'utf8')
      .digest('hex');
    const locallyAllowed = this.consumeLocal(key, limit, windowMilliseconds);

    if (!locallyAllowed) {
      throw this.rateLimited();
    }

    let distributedAllowed = true;
    try {
      distributedAllowed = await this.distributedStore.consume(key, limit, windowMilliseconds);
    } catch {
      // Redis is an enforcement coordinator, not the source of truth. The
      // bounded process-local limiter remains active during provider failure.
    }

    if (!distributedAllowed) {
      throw this.rateLimited();
    }
  }

  private consumeLocal(key: string, limit: number, windowMilliseconds: number): boolean {
    const now = Date.now();
    const current = this.localWindows.get(key);

    if (!current || current.resetAt <= now) {
      this.localWindows.set(key, { count: 1, resetAt: now + windowMilliseconds });
      this.trimLocalWindows(now);
      return true;
    }

    current.count += 1;
    return current.count <= limit;
  }

  private trimLocalWindows(now: number): void {
    if (this.localWindows.size <= 10_000) return;

    for (const [key, window] of this.localWindows) {
      if (window.resetAt <= now || this.localWindows.size > 9_000) {
        this.localWindows.delete(key);
      }
      if (this.localWindows.size <= 9_000) return;
    }
  }

  private rateLimited(): HttpException {
    return new HttpException(
      {
        code: 'RATE_LIMITED',
        details: [],
        message: 'Too many authentication attempts. Try again later.',
        retryable: true,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
