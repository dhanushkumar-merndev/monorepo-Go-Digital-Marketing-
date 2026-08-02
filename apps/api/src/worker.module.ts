import { Module } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { LoggerModule } from 'nestjs-pino';
import { BackgroundProcessingModule } from './background/background-processing.module.js';
import { API_ENVIRONMENT, ApiConfigModule } from './config/api-config.module.js';
import { createPinoHttpOptions } from './observability/pino-options.js';

@Module({
  imports: [
    ApiConfigModule,
    LoggerModule.forRootAsync({
      imports: [ApiConfigModule],
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment) => ({
        pinoHttp: createPinoHttpOptions(environment),
      }),
    }),
    BackgroundProcessingModule.forStandaloneWorker(),
  ],
})
export class WorkerModule {}
