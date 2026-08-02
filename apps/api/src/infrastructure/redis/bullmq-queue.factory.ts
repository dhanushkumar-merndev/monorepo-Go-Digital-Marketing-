import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { RedisConnectionService } from './redis-connection.service.js';
import type { BullMqQueueFactory } from './redis.tokens.js';

const SAFE_QUEUE_NAME = /^[a-z][a-z0-9-]{1,62}$/;

@Injectable()
export class DefaultBullMqQueueFactory implements BullMqQueueFactory, BeforeApplicationShutdown {
  private readonly queues = new Map<Queue, Redis>();

  constructor(
    @Inject(RedisConnectionService)
    private readonly redis: RedisConnectionService,
  ) {}

  createQueue(name: string): Queue {
    if (!SAFE_QUEUE_NAME.test(name)) {
      throw new Error(`Invalid BullMQ queue name: ${name}`);
    }

    const connection = this.redis.createQueueClient();
    const queue = new Queue(name, {
      connection,
      prefix: 'gdm',
    });

    this.queues.set(queue, connection);
    return queue;
  }

  async beforeApplicationShutdown(): Promise<void> {
    await Promise.allSettled(
      [...this.queues].map(async ([queue, connection]) => {
        try {
          await queue.close();
        } finally {
          await this.redis.closeDedicatedClient(connection);
        }
      }),
    );
    this.queues.clear();
  }
}
