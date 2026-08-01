import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import * as Sentry from '@sentry/node';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import type { ErrorReportContext, ErrorReporter } from './error-reporter.js';

@Injectable()
export class SentryErrorReporter implements ErrorReporter, OnApplicationShutdown {
  private readonly enabled: boolean;

  constructor(@Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment) {
    this.enabled = Boolean(environment.sentryDsn);

    if (environment.sentryDsn) {
      Sentry.init({
        dsn: environment.sentryDsn,
        environment: environment.nodeEnv,
        sendDefaultPii: false,
      });
    }
  }

  captureException(error: unknown, context: ErrorReportContext): void {
    if (!this.enabled) {
      return;
    }

    Sentry.withScope((scope) => {
      scope.setTag('error.code', context.errorCode);
      scope.setTag('http.status_code', String(context.statusCode));
      scope.setTag('correlation_id', context.correlationId);
      scope.setContext('request', {
        method: context.method,
        path: context.path,
      });
      Sentry.captureException(error);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.enabled) {
      await Sentry.close(2_000);
    }
  }
}
