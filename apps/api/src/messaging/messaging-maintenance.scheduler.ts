import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  BACKGROUND_RUNTIME_ROLE,
  PLATFORM_BACKGROUND_QUEUE,
} from '../background/background-processing.lifecycle.js';
import {
  shouldStartLocalWorker,
  type BackgroundRuntimeRole,
} from '../background/background-processing-mode.js';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import {
  BULLMQ_QUEUE_FACTORY,
  type BullMqQueueFactory,
} from '../infrastructure/redis/redis.tokens.js';

const SCHEDULER_ID = 'messaging-retention-v1';
const INTERVAL_MS = 60 * 60_000;

@Injectable()
export class MessagingMaintenanceScheduler
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private queue: Queue | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private registered = false;

  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(BACKGROUND_RUNTIME_ROLE) private readonly role: BackgroundRuntimeRole,
    @Inject(BULLMQ_QUEUE_FACTORY) private readonly queueFactory: BullMqQueueFactory,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MessagingMaintenanceScheduler.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!shouldStartLocalWorker(this.role, this.environment.workerMode)) return;
    if (await this.ensureRegistered()) return;
    this.retryTimer = setInterval(() => void this.ensureRegistered(), 60_000);
    this.retryTimer.unref();
  }

  beforeApplicationShutdown(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = undefined;
  }

  private async ensureRegistered(): Promise<boolean> {
    if (this.registered) return true;
    try {
      this.queue ??= this.queueFactory.createQueue(PLATFORM_BACKGROUND_QUEUE);
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: INTERVAL_MS },
        {
          data: {},
          name: 'messaging.retention.sweep',
          opts: {
            attempts: 5,
            backoff: { delay: 5_000, jitter: 0.5, type: 'exponential' },
            removeOnComplete: 1_000,
            removeOnFail: 1_000,
          },
        },
      );
      this.registered = true;
      if (this.retryTimer) clearInterval(this.retryTimer);
      this.retryTimer = undefined;
      this.logger.info(
        { interval_ms: INTERVAL_MS, scheduler_id: SCHEDULER_ID },
        'Messaging retention scheduler registered',
      );
      return true;
    } catch (error) {
      this.logger.error(
        { error_type: error instanceof Error ? error.constructor.name : typeof error },
        'Messaging retention scheduler registration failed; expiry markers remain durable',
      );
      return false;
    }
  }
}
