import { Inject, Injectable } from '@nestjs/common';
import { Worker } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { RedisConnectionService } from './redis-connection.service.js';
import type {
  BackgroundWorker,
  BackgroundJobProcessor,
  BullMqWorkerFactory,
} from './redis.tokens.js';

const SAFE_QUEUE_NAME = /^[a-z][a-z0-9-]{1,62}$/;

@Injectable()
export class DefaultBullMqWorkerFactory implements BullMqWorkerFactory {
  constructor(
    @Inject(RedisConnectionService)
    private readonly redis: RedisConnectionService,
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DefaultBullMqWorkerFactory.name);
  }

  createWorker(name: string, processor: BackgroundJobProcessor): BackgroundWorker {
    if (!SAFE_QUEUE_NAME.test(name)) {
      throw new Error(`Invalid BullMQ queue name: ${name}`);
    }

    const connection = this.redis.createWorkerClient();
    const worker = new Worker<unknown, unknown>(
      name,
      async (job) =>
        processor({
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
        }),
      {
        connection,
        prefix: 'gdm',
      },
    );

    worker.on('error', (error: Error) => {
      this.logger.error(
        { error_type: error.constructor.name, queue_name: name },
        'Background worker connection error',
      );
    });
    worker.on('failed', (job, error: Error) => {
      this.logger.error(
        {
          error_type: error.constructor.name,
          job_id: job?.id,
          job_name: job?.name,
          queue_name: name,
        },
        'Background job failed',
      );
    });

    return {
      close: async (): Promise<void> => {
        try {
          await worker.close();
        } finally {
          await this.redis.closeDedicatedClient(connection);
        }
      },
      isRunning: (): boolean => worker.isRunning(),
    };
  }
}
