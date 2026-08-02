import { Module, type DynamicModule } from '@nestjs/common';
import { ApiConfigModule } from '../config/api-config.module.js';
import { RedisInfrastructureModule } from '../infrastructure/redis/redis.module.js';
import { BackgroundJobProcessorRegistry } from './background-job-processor.registry.js';
import {
  BACKGROUND_RUNTIME_ROLE,
  BackgroundProcessingLifecycle,
} from './background-processing.lifecycle.js';
import type { BackgroundRuntimeRole } from './background-processing-mode.js';

@Module({})
export class BackgroundProcessingModule {
  static forApi(): DynamicModule {
    return this.forRole('api');
  }

  static forStandaloneWorker(): DynamicModule {
    return this.forRole('worker');
  }

  private static forRole(role: BackgroundRuntimeRole): DynamicModule {
    return {
      module: BackgroundProcessingModule,
      imports: [ApiConfigModule, RedisInfrastructureModule],
      providers: [
        BackgroundJobProcessorRegistry,
        BackgroundProcessingLifecycle,
        {
          provide: BACKGROUND_RUNTIME_ROLE,
          useValue: role,
        },
      ],
      exports: [BackgroundJobProcessorRegistry],
    };
  }
}
