import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { PinoLogger } from 'nestjs-pino';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import {
  BULLMQ_WORKER_FACTORY,
  type BackgroundWorker,
  type BullMqWorkerFactory,
} from '../infrastructure/redis/redis.tokens.js';
import { BackgroundJobProcessorRegistry } from './background-job-processor.registry.js';
import {
  shouldStartLocalWorker,
  type BackgroundRuntimeRole,
} from './background-processing-mode.js';

export const BACKGROUND_RUNTIME_ROLE = Symbol('BACKGROUND_RUNTIME_ROLE');
export const PLATFORM_BACKGROUND_QUEUE = 'platform-jobs';

@Injectable()
export class BackgroundProcessingLifecycle
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private worker: BackgroundWorker | undefined;

  constructor(
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApiEnvironment,
    @Inject(BULLMQ_WORKER_FACTORY)
    private readonly workerFactory: BullMqWorkerFactory,
    @Inject(BackgroundJobProcessorRegistry)
    private readonly processors: BackgroundJobProcessorRegistry,
    @Inject(BACKGROUND_RUNTIME_ROLE)
    private readonly role: BackgroundRuntimeRole,
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BackgroundProcessingLifecycle.name);
  }

  onApplicationBootstrap(): void {
    if (!shouldStartLocalWorker(this.role, this.environment.workerMode)) {
      this.logger.info(
        {
          processing_location:
            this.environment.workerMode === 'standalone' ? 'external' : 'disabled',
          worker_mode: this.environment.workerMode,
        },
        'Local background processing is not running',
      );
      return;
    }

    this.worker = this.workerFactory.createWorker(PLATFORM_BACKGROUND_QUEUE, async (job) =>
      this.processors.process(job),
    );
    this.logger.info(
      {
        queue_name: PLATFORM_BACKGROUND_QUEUE,
        runtime_role: this.role,
        worker_mode: this.environment.workerMode,
      },
      'Background worker started',
    );
  }

  async beforeApplicationShutdown(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;

    if (!worker) {
      return;
    }

    await worker.close();
    this.logger.info(
      { queue_name: PLATFORM_BACKGROUND_QUEUE, runtime_role: this.role },
      'Background worker stopped',
    );
  }
}
