import type { ApiEnvironment } from '@gdm/config';
import type { Response } from 'express';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attachCorrelationId,
  type CorrelatedRequest,
} from '../common/correlation/correlation-id.js';

const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.accessToken',
  'req.body.access_token',
  'req.body.idToken',
  'req.body.id_token',
  'req.body.refreshToken',
  'req.body.refresh_token',
  'req.body.secret',
  'req.body.token',
  'res.headers["set-cookie"]',
];

export function createPinoHttpOptions(
  environment: ApiEnvironment,
): NonNullable<Params['pinoHttp']> {
  return {
    level: environment.logLevel,
    redact: {
      paths: REDACTED_LOG_PATHS,
      remove: true,
    },
    genReqId: (request: IncomingMessage, response: ServerResponse<IncomingMessage>): string =>
      attachCorrelationId(request as CorrelatedRequest, response as unknown as Response),
    customProps: (request: IncomingMessage) => ({
      correlation_id: (request as CorrelatedRequest).correlationId,
    }),
    customLogLevel: (
      _request: IncomingMessage,
      response: ServerResponse<IncomingMessage>,
      error?: Error,
    ): 'info' | 'warn' | 'error' => {
      if (error || response.statusCode >= 500) {
        return 'error';
      }

      if (response.statusCode >= 400) {
        return 'warn';
      }

      return 'info';
    },
    serializers: {
      req(request: { id?: string; method?: string; url?: string; remoteAddress?: string }) {
        return {
          id: request.id,
          method: request.method,
          path: request.url?.split('?', 1)[0],
          remote_address: request.remoteAddress,
        };
      },
      res(response: { statusCode?: number }) {
        return { status_code: response.statusCode };
      },
    },
  };
}
