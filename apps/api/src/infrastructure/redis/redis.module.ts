import { Module } from '@nestjs/common';
import { ApiConfigModule } from '../../config/api-config.module.js';
import { DefaultBullMqQueueFactory } from './bullmq-queue.factory.js';
import { DefaultBullMqWorkerFactory } from './bullmq-worker.factory.js';
import { RedisConnectionService } from './redis-connection.service.js';
import {
  BULLMQ_QUEUE_FACTORY,
  BULLMQ_WORKER_FACTORY,
  REDIS_CONNECTION,
  REDIS_HEALTH_PROBE,
} from './redis.tokens.js';

@Module({
  imports: [ApiConfigModule],
  providers: [
    RedisConnectionService,
    DefaultBullMqQueueFactory,
    DefaultBullMqWorkerFactory,
    {
      provide: REDIS_CONNECTION,
      useExisting: RedisConnectionService,
    },
    {
      provide: REDIS_HEALTH_PROBE,
      useExisting: RedisConnectionService,
    },
    {
      provide: BULLMQ_QUEUE_FACTORY,
      useExisting: DefaultBullMqQueueFactory,
    },
    {
      provide: BULLMQ_WORKER_FACTORY,
      useExisting: DefaultBullMqWorkerFactory,
    },
  ],
  exports: [
    REDIS_CONNECTION,
    REDIS_HEALTH_PROBE,
    BULLMQ_QUEUE_FACTORY,
    BULLMQ_WORKER_FACTORY,
  ],
})
export class RedisInfrastructureModule {}
