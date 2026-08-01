export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

export interface ErrorReportContext {
  correlationId: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode: string;
}

export interface ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void;
}
