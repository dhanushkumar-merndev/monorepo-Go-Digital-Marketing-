import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { ApiEnvironment } from '@gdm/config';
import pino from 'pino';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApplication } from './application.js';
import { API_ENVIRONMENT } from './config/api-config.module.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureApplication(application);

  const environment = application.get<ApiEnvironment>(API_ENVIRONMENT);
  await application.listen(environment.port, environment.host);

  const startupLogger = await application.resolve(PinoLogger);
  startupLogger.setContext('Bootstrap');
  startupLogger.info(
    {
      environment: environment.nodeEnv,
      host: environment.host,
      port: environment.port,
    },
    'API listening',
  );
}

void bootstrap().catch((error: unknown) => {
  const logger = pino({ level: 'fatal' });
  logger.fatal(
    {
      error_type: error instanceof Error ? error.constructor.name : typeof error,
    },
    'API bootstrap failed',
  );
  process.exitCode = 1;
});
