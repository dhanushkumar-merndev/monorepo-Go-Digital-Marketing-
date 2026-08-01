import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { performance } from 'node:perf_hooks';
import { API_ENVIRONMENT } from '../../config/api-config.module.js';
import type { RedisHealthProbe } from './redis.tokens.js';

@Injectable()
export class RedisConnectionService implements RedisHealthProbe, OnApplicationShutdown {
  private readonly client: Redis;
  private readonly dedicatedClients = new Set<Redis>();
  private readonly closingClients = new WeakMap<Redis, Promise<void>>();
  private readonly healthConnectTimeoutMs: number;

  constructor(
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisConnectionService.name);
    this.healthConnectTimeoutMs = environment.redisConnectTimeoutMs;
    this.client = new Redis(environment.redisUrl, {
      connectTimeout: environment.redisConnectTimeoutMs,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn({ error_type: error.constructor.name }, 'Redis connection error');
    });
  }

  createQueueClient(): Redis {
    return this.registerDedicatedClient(
      this.client.duplicate({
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      }),
    );
  }

  createWorkerClient(): Redis {
    return this.registerDedicatedClient(
      this.client.duplicate({
        enableOfflineQueue: true,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      }),
    );
  }

  async closeDedicatedClient(client: Redis): Promise<void> {
    const existingClose = this.closingClients.get(client);

    if (existingClose) {
      await existingClose;
      return;
    }

    const close = this.closeClient(client).finally(() => {
      this.dedicatedClients.delete(client);
      this.closingClients.delete(client);
    });
    this.closingClients.set(client, close);
    await close;
  }

  private registerDedicatedClient(client: Redis): Redis {
    this.dedicatedClients.add(client);
    client.on('error', (error: Error) => {
      this.logger.warn({ error_type: error.constructor.name }, 'Dedicated Redis connection error');
    });
    return client;
  }

  private async closeClient(client: Redis): Promise<void> {
    if (client.status === 'wait' || client.status === 'end') {
      client.disconnect(false);
      return;
    }

    try {
      await client.quit();
    } catch {
      client.disconnect(false);
    }
  }

  private createHealthClient(): Redis {
    return this.client.duplicate({
      connectTimeout: this.healthConnectTimeoutMs,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async ping(): Promise<{ latencyMs: number }> {
    const startedAt = performance.now();
    const healthClient = this.createHealthClient();
    healthClient.on('error', () => undefined);

    try {
      await healthClient.connect();
      const result = await healthClient.ping();

      if (result !== 'PONG') {
        throw new Error('Redis returned an unexpected ping response.');
      }

      return {
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } finally {
      healthClient.disconnect(false);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(
      [...this.dedicatedClients].map(async (client) => this.closeDedicatedClient(client)),
    );
    await this.closeClient(this.client);
  }
}
