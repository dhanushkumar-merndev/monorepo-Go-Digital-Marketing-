export interface ClientErrorContext {
  boundary: 'app' | 'root';
  digest?: string;
}

export interface ClientErrorReporter {
  captureException(error: Error, context: ClientErrorContext): void;
}

const noopReporter: ClientErrorReporter = {
  captureException: () => undefined,
};

let activeReporter: ClientErrorReporter = noopReporter;

export function configureClientErrorReporter(reporter: ClientErrorReporter): void {
  activeReporter = reporter;
}

export function reportClientError(error: Error, context: ClientErrorContext): void {
  activeReporter.captureException(error, context);
}
