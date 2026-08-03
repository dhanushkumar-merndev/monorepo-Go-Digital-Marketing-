import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException, type ArgumentsHost } from '@nestjs/common';
import type { ErrorReporter } from '../src/observability/error-reporter.js';
import { ApiExceptionFilter } from '../src/common/errors/api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  it('never exposes explicit internal HttpException messages or details', () => {
    let body: unknown;
    let statusCode: number | undefined;
    const logger = {
      setContext: (): void => undefined,
      error: (): void => undefined,
      warn: (): void => undefined,
    };
    const reporter: ErrorReporter = {
      captureException: (): void => undefined,
    };
    const response = {
      setHeader: (): void => undefined,
      status(value: number) {
        statusCode = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    };
    const request = {
      correlationId: undefined as string | undefined,
      headers: {},
      method: 'GET',
      path: '/v1/protected',
      url: '/v1/protected',
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const filter = new ApiExceptionFilter(logger as never, reporter);

    filter.catch(
      new HttpException(
        {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'postgresql://secret@internal-host/database',
          details: [{ reason: 'provider credential leaked here' }],
        },
        500,
      ),
      host,
    );

    assert.equal(statusCode, 500);
    assert.deepEqual(body, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        correlation_id: request.correlationId,
        details: [],
        retryable: true,
      },
    });
  });

  it('keeps provider outages distinct while sanitizing the 503 response', () => {
    let body: unknown;
    let statusCode: number | undefined;
    const logger = {
      setContext: (): void => undefined,
      error: (): void => undefined,
      warn: (): void => undefined,
    };
    const reporter: ErrorReporter = {
      captureException: (): void => undefined,
    };
    const response = {
      setHeader: (): void => undefined,
      status(value: number) {
        statusCode = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    };
    const request = {
      correlationId: 'provider-outage-test',
      headers: {},
      method: 'POST',
      path: '/v1/auth/google/login',
      url: '/v1/auth/google/login',
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter(logger as never, reporter).catch(
      new HttpException(
        {
          code: 'PROVIDER_UNAVAILABLE',
          details: [{ reason: 'upstream transport and credential details' }],
          message: 'sensitive upstream failure',
        },
        503,
      ),
      host,
    );

    assert.equal(statusCode, 503);
    assert.deepEqual(body, {
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        correlation_id: 'provider-outage-test',
        details: [],
        message: 'A required provider is temporarily unavailable.',
        retryable: true,
      },
    });
  });
});
