import { Module } from '@nestjs/common';
import { ERROR_REPORTER } from './error-reporter.js';
import { SentryErrorReporter } from './sentry-error-reporter.js';

@Module({
  providers: [
    SentryErrorReporter,
    {
      provide: ERROR_REPORTER,
      useExisting: SentryErrorReporter,
    },
  ],
  exports: [ERROR_REPORTER],
})
export class ObservabilityModule {}
