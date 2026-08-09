import { createHash, randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { RedisConnectionService } from '../infrastructure/redis/redis-connection.service.js';
import { REDIS_CONNECTION } from '../infrastructure/redis/redis.tokens.js';

export const MESSAGING_RATE_LIMIT_STORE = Symbol('MESSAGING_RATE_LIMIT_STORE');

export interface MessagingRateLimitStore {
  acquireConcurrency(key: string, token: string, limit: number, leaseMs: number): Promise<boolean>;
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
  releaseConcurrency(key: string, token: string): Promise<void>;
}

const WEBHOOK_PROVIDER_LIMIT = 1_200;
const WEBHOOK_CONNECTION_LIMIT = 300;
const OUTBOUND_PROVIDER_LIMIT = 1_000;
const OUTBOUND_TENANT_PROVIDER_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const OUTBOUND_PROVIDER_CONCURRENCY = 64;
const OUTBOUND_TENANT_PROVIDER_CONCURRENCY = 8;
const OUTBOUND_CONCURRENCY_LEASE_MS = 60_000;

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const ACQUIRE_CONCURRENCY_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]) + tonumber(ARGV[2]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

@Injectable()
export class RedisMessagingRateLimitStore implements MessagingRateLimitStore {
  private client: Redis;
  private connection: Promise<void> | undefined;

  constructor(
    @Inject(REDIS_CONNECTION)
    private readonly connectionService: RedisConnectionService,
  ) {
    this.client = connectionService.createRateLimitClient();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    await this.connect();
    const count = await this.client.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      `gdm:messaging-rate:${key}`,
      String(windowMs),
    );
    return Number(count) <= limit;
  }

  async acquireConcurrency(
    key: string,
    token: string,
    limit: number,
    leaseMs: number,
  ): Promise<boolean> {
    await this.connect();
    const acquired = await this.client.eval(
      ACQUIRE_CONCURRENCY_SCRIPT,
      1,
      `gdm:messaging-concurrency:${key}`,
      String(Date.now()),
      String(leaseMs),
      String(limit),
      token,
    );
    return Number(acquired) === 1;
  }

  async releaseConcurrency(key: string, token: string): Promise<void> {
    await this.connect();
    await this.client.zrem(`gdm:messaging-concurrency:${key}`, token);
  }

  private async connect(): Promise<void> {
    if (this.client.status === 'end') {
      this.client = this.connectionService.createRateLimitClient();
    }
    if (this.client.status === 'ready') return;
    this.connection ??= this.client.connect().finally(() => {
      this.connection = undefined;
    });
    await this.connection;
  }
}

interface LocalWindow {
  count: number;
  resetAt: number;
}

interface AcquiredPermit {
  distributed: boolean;
  key: string;
  token: string;
}

export class MessagingRateLimitExceededError extends HttpException {
  readonly providerErrorCode = 'PROVIDER_RATE_LIMITED';

  constructor(scope: 'OUTBOUND' | 'WEBHOOK') {
    super(
      {
        code: 'RATE_LIMITED',
        details: [],
        message:
          scope === 'WEBHOOK'
            ? 'The messaging webhook request budget was exceeded.'
            : 'The messaging provider send budget was exceeded.',
        retryable: true,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class MessagingRateLimiter {
  private readonly localConcurrency = new Map<string, Map<string, number>>();
  private readonly localWindows = new Map<string, LocalWindow>();

  constructor(
    @Inject(MESSAGING_RATE_LIMIT_STORE)
    private readonly distributedStore: MessagingRateLimitStore,
  ) {}

  async assertWebhookAllowed(provider: string, connectionKey: string): Promise<void> {
    const normalizedProvider = provider.trim().toUpperCase();
    await this.assertRate(
      'webhook-provider',
      normalizedProvider,
      WEBHOOK_PROVIDER_LIMIT,
      'WEBHOOK',
    );
    await this.assertRate(
      'webhook-connection',
      `${normalizedProvider}\u0000${connectionKey}`,
      WEBHOOK_CONNECTION_LIMIT,
      'WEBHOOK',
    );
  }

  async withOutboundPermit<T>(
    clientOrganizationId: string,
    provider: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const normalizedProvider = provider.trim().toUpperCase();
    const tenantProvider = `${clientOrganizationId}\u0000${normalizedProvider}`;
    await this.assertRate(
      'outbound-provider',
      normalizedProvider,
      OUTBOUND_PROVIDER_LIMIT,
      'OUTBOUND',
    );
    await this.assertRate(
      'outbound-tenant-provider',
      tenantProvider,
      OUTBOUND_TENANT_PROVIDER_LIMIT,
      'OUTBOUND',
    );

    const permits: AcquiredPermit[] = [];
    try {
      permits.push(
        await this.acquirePermit(
          'outbound-provider',
          normalizedProvider,
          OUTBOUND_PROVIDER_CONCURRENCY,
        ),
      );
      permits.push(
        await this.acquirePermit(
          'outbound-tenant-provider',
          tenantProvider,
          OUTBOUND_TENANT_PROVIDER_CONCURRENCY,
        ),
      );
      return await operation();
    } finally {
      await Promise.allSettled(permits.map(async (permit) => this.releasePermit(permit)));
    }
  }

  private async assertRate(
    bucket: string,
    discriminator: string,
    limit: number,
    scope: 'OUTBOUND' | 'WEBHOOK',
  ): Promise<void> {
    const key = this.key(bucket, discriminator);
    if (!this.consumeLocal(key, limit, RATE_WINDOW_MS)) {
      throw new MessagingRateLimitExceededError(scope);
    }
    try {
      if (!(await this.distributedStore.consume(key, limit, RATE_WINDOW_MS))) {
        throw new MessagingRateLimitExceededError(scope);
      }
    } catch (error) {
      if (error instanceof MessagingRateLimitExceededError) throw error;
      // PostgreSQL/provider work remains available during Redis failure while
      // this process-local bounded limiter continues to enforce a safe ceiling.
    }
  }

  private async acquirePermit(
    bucket: string,
    discriminator: string,
    limit: number,
  ): Promise<AcquiredPermit> {
    const key = this.key(bucket, discriminator);
    const token = randomUUID();
    if (!this.acquireLocal(key, token, limit, OUTBOUND_CONCURRENCY_LEASE_MS)) {
      throw new MessagingRateLimitExceededError('OUTBOUND');
    }
    try {
      const distributed = await this.distributedStore.acquireConcurrency(
        key,
        token,
        limit,
        OUTBOUND_CONCURRENCY_LEASE_MS,
      );
      if (!distributed) {
        this.releaseLocal(key, token);
        throw new MessagingRateLimitExceededError('OUTBOUND');
      }
      return { distributed: true, key, token };
    } catch (error) {
      if (error instanceof MessagingRateLimitExceededError) throw error;
      return { distributed: false, key, token };
    }
  }

  private async releasePermit(permit: AcquiredPermit): Promise<void> {
    this.releaseLocal(permit.key, permit.token);
    if (!permit.distributed) return;
    try {
      await this.distributedStore.releaseConcurrency(permit.key, permit.token);
    } catch {
      // The distributed lease expires even when Redis is unavailable here.
    }
  }

  private consumeLocal(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const current = this.localWindows.get(key);
    if (!current || current.resetAt <= now) {
      this.localWindows.set(key, { count: 1, resetAt: now + windowMs });
      this.trimLocalState(now);
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  }

  private acquireLocal(key: string, token: string, limit: number, leaseMs: number): boolean {
    const now = Date.now();
    const permits = this.localConcurrency.get(key) ?? new Map<string, number>();
    for (const [currentToken, expiresAt] of permits) {
      if (expiresAt <= now) permits.delete(currentToken);
    }
    if (permits.size >= limit) return false;
    permits.set(token, now + leaseMs);
    this.localConcurrency.set(key, permits);
    this.trimLocalState(now);
    return true;
  }

  private releaseLocal(key: string, token: string): void {
    const permits = this.localConcurrency.get(key);
    permits?.delete(token);
    if (permits?.size === 0) this.localConcurrency.delete(key);
  }

  private trimLocalState(now: number): void {
    if (this.localWindows.size > 10_000) {
      for (const [key, window] of this.localWindows) {
        if (window.resetAt <= now || this.localWindows.size > 9_000) this.localWindows.delete(key);
        if (this.localWindows.size <= 9_000) break;
      }
    }
    if (this.localConcurrency.size <= 10_000) return;
    for (const [key, permits] of this.localConcurrency) {
      for (const [token, expiresAt] of permits) {
        if (expiresAt <= now) permits.delete(token);
      }
      if (permits.size === 0 || this.localConcurrency.size > 9_000)
        this.localConcurrency.delete(key);
      if (this.localConcurrency.size <= 9_000) break;
    }
  }

  private key(bucket: string, discriminator: string): string {
    return createHash('sha256').update(`${bucket}\u0000${discriminator}`, 'utf8').digest('hex');
  }
}
