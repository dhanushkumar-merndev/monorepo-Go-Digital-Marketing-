import type { INestApplication } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Response } from 'express';
import { Logger } from 'nestjs-pino';
import {
  attachCorrelationId,
  type CorrelatedRequest,
} from './common/correlation/correlation-id.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe.js';
import { API_ENVIRONMENT } from './config/api-config.module.js';

export interface ConfigureApplicationOptions {
  enableShutdownHooks?: boolean;
  openApi?: boolean;
}

export function configureApplication(
  application: INestApplication,
  options: ConfigureApplicationOptions = {},
): void {
  const environment = application.get<ApiEnvironment>(API_ENVIRONMENT);

  application.use((request: CorrelatedRequest, response: Response, next: NextFunction): void => {
    attachCorrelationId(request, response);
    next();
  });
  application.useLogger(application.get(Logger));
  application.flushLogs();
  application.setGlobalPrefix('v1');
  application.enableCors({
    credentials: true,
    origin: environment.corsOrigins,
  });
  application.useGlobalPipes(application.get(ZodValidationPipe));
  application.useGlobalFilters(application.get(ApiExceptionFilter));

  const express = application.getHttpAdapter().getInstance() as {
    disable?: (setting: string) => void;
  };
  express.disable?.('x-powered-by');

  if (options.enableShutdownHooks ?? true) {
    application.enableShutdownHooks();
  }

  if (options.openApi ?? true) {
    const configuration = new DocumentBuilder()
      .setTitle('Go Digital Automobile CRM API')
      .setDescription('Versioned REST API for the Go Digital Automobile CRM modular monolith.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(application, configuration);

    SwaggerModule.setup('docs', application, document, {
      customSiteTitle: 'Go Digital Automobile CRM API',
      swaggerOptions: {
        persistAuthorization: false,
      },
    });
  }
}
