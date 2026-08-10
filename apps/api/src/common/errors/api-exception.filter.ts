import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  apiErrorCodeSchema,
  type ApiErrorCode,
  type ApiErrorDetail,
  type ApiErrorEnvelope,
} from '@gdm/contracts';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { attachCorrelationId, type CorrelatedRequest } from '../correlation/correlation-id.js';
import { ERROR_REPORTER, type ErrorReporter } from '../../observability/error-reporter.js';

type ApiErrorPayload = Omit<ApiErrorEnvelope['error'], 'correlation_id'>;

interface HttpExceptionBody {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  retryable?: unknown;
}

const STATUS_ERROR_CODES: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'PROVIDER_UNAVAILABLE',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function statusCodeFor(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

const MAX_LOGGED_DATABASE_TEXT = 500;

/**
 * A DrizzleQueryError's own message is only "Failed query", so a bare
 * exception_type tells an operator nothing. The actionable Postgres fields sit
 * on its cause. Bound params and the driver's `detail` are deliberately left
 * out: both echo row values, and these tables carry token hashes and MFA
 * secrets.
 */
function databaseErrorContext(exception: unknown): Record<string, string> {
  if (!(exception instanceof Error)) {
    return {};
  }

  const context: Record<string, string> = {};
  const { query } = exception as { query?: unknown };

  if (typeof query === 'string') {
    context.db_query = query.slice(0, MAX_LOGGED_DATABASE_TEXT);
  }

  const cause: unknown = exception.cause;

  if (!isRecord(cause)) {
    return context;
  }

  const fields: Record<string, unknown> = {
    db_code: cause.code,
    db_column: cause.column_name,
    db_constraint: cause.constraint_name,
    db_routine: cause.routine,
    db_table: cause.table_name,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      context[key] = value;
    }
  }

  if (cause instanceof Error) {
    context.db_message = cause.message.slice(0, MAX_LOGGED_DATABASE_TEXT);
  }

  return context;
}

function defaultMessage(statusCode: number): string {
  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return 'An unexpected error occurred.';
  }

  return HttpStatus[statusCode] ?? 'Request failed.';
}

function detailsFrom(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ApiErrorDetail[] => {
    if (typeof item === 'string') {
      return [{ reason: item }];
    }

    if (!isRecord(item) || typeof item.reason !== 'string') {
      return [];
    }

    return [
      {
        ...(typeof item.field === 'string' ? { field: item.field } : {}),
        reason: item.reason,
      },
    ];
  });
}

function payloadFor(exception: unknown, statusCode: number): ApiErrorPayload {
  if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'A required provider is temporarily unavailable.',
      details: [],
      retryable: true,
    };
  }

  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return {
      code: 'INTERNAL_ERROR',
      message: defaultMessage(statusCode),
      details: [],
      retryable: true,
    };
  }

  if (!(exception instanceof HttpException)) {
    return {
      code: 'INTERNAL_ERROR',
      message: defaultMessage(statusCode),
      details: [],
      retryable: false,
    };
  }

  const response = exception.getResponse();
  const body: HttpExceptionBody = isRecord(response) ? response : {};
  const responseMessage = typeof response === 'string' ? response : body.message;
  const message =
    typeof responseMessage === 'string'
      ? responseMessage
      : Array.isArray(responseMessage)
        ? 'Request validation failed.'
        : defaultMessage(statusCode);
  const parsedCode = apiErrorCodeSchema.safeParse(body.code);
  const code = parsedCode.success
    ? parsedCode.data
    : (STATUS_ERROR_CODES[statusCode] ??
      (statusCode >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'));
  const details = detailsFrom(body.details ?? responseMessage);

  return {
    code,
    message,
    details,
    retryable: typeof body.retryable === 'boolean' ? body.retryable : statusCode >= 500,
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
    @Inject(ERROR_REPORTER) private readonly errorReporter: ErrorReporter,
  ) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const statusCode = statusCodeFor(exception);
    const correlationId = attachCorrelationId(request, response);
    const payload = payloadFor(exception, statusCode);
    const path = request.path || request.url.split('?', 1)[0] || '/';
    const logContext = {
      error_code: payload.code,
      exception_type: exception instanceof Error ? exception.constructor.name : typeof exception,
      method: request.method,
      path,
      status_code: statusCode,
      ...databaseErrorContext(exception),
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logContext, 'Request failed');
      this.errorReporter.captureException(exception, {
        correlationId,
        method: request.method,
        path,
        statusCode,
        errorCode: payload.code,
      });
    } else {
      this.logger.warn(logContext, 'Request rejected');
    }

    response.status(statusCode).json({
      error: {
        ...payload,
        correlation_id: correlationId,
      },
    });
  }
}
