import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseApiEnvironment } from '@gdm/config';
import { Logger, PinoLogger } from 'nestjs-pino';
import pino from 'pino';
import { assertStandaloneWorkerMode } from './background/background-processing-mode.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  assertStandaloneWorkerMode(environment.workerMode);

  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  application.useLogger(application.get(Logger));
  application.flushLogs();
  application.enableShutdownHooks();

  const startupLogger = await application.resolve(PinoLogger);
  startupLogger.setContext('WorkerBootstrap');
  startupLogger.info(
    { environment: environment.nodeEnv, worker_mode: environment.workerMode },
    'Standalone background worker running',
  );
}

void bootstrap().catch((error: unknown) => {
  const logger = pino({ level: 'fatal' });
  logger.fatal(
    {
      error_type: error instanceof Error ? error.constructor.name : typeof error,
    },
    'Standalone worker bootstrap failed',
  );
  process.exitCode = 1;
});
