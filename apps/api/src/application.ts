import type { INestApplication } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth/auth-runtime-config.js';
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

interface BodyParserApplication {
  useBodyParser(type: 'json' | 'urlencoded', options: { extended?: boolean; limit: string }): void;
}

export function configureApplication(
  application: INestApplication,
  options: ConfigureApplicationOptions = {},
): void {
  const environment = application.get<ApiEnvironment>(API_ENVIRONMENT);
  const express = application.getHttpAdapter().getInstance() as {
    disable?: (setting: string) => void;
    set?: (setting: string, value: unknown) => void;
  };

  if (environment.trustedProxies.length > 0) {
    express.set?.('trust proxy', environment.trustedProxies);
  }

  const bodyParserApplication = application as INestApplication & BodyParserApplication;
  bodyParserApplication.useBodyParser('json', { limit: '1mb' });
  bodyParserApplication.useBodyParser('urlencoded', { extended: false, limit: '64kb' });

  application.use((request: CorrelatedRequest, response: Response, next: NextFunction): void => {
    attachCorrelationId(request, response);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (environment.nodeEnv === 'staging' || environment.nodeEnv === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
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

  express.disable?.('x-powered-by');

  if (options.enableShutdownHooks ?? true) {
    application.enableShutdownHooks();
  }

  if (options.openApi ?? environment.openApiEnabled) {
    const auth = application.get<AuthRuntimeConfig>(AUTH_RUNTIME_CONFIG);
    const configuration = new DocumentBuilder()
      .setTitle('Go Digital Automobile CRM API')
      .setDescription('Versioned REST API for the Go Digital Automobile CRM modular monolith.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addCookieAuth(
        auth.cookieName,
        {
          description:
            'HttpOnly refresh cookie used by the web client. Mobile clients send refresh_token in the JSON body instead.',
          in: 'cookie',
          type: 'apiKey',
        },
        'refreshCookie',
      )
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
