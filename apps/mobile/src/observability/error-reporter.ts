export interface ErrorReportContext {
  feature: string;
  operation?: string;
}

export interface ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void;
}

const developmentReporter: ErrorReporter = {
  captureException(error, context) {
    if (__DEV__) {
      console.error(`[${context.feature}] ${context.operation ?? 'unhandled'}`, error);
    }
  },
};

let activeReporter = developmentReporter;

export function configureErrorReporter(reporter: ErrorReporter): void {
  activeReporter = reporter;
}

export function reportError(error: unknown, context: ErrorReportContext): void {
  activeReporter.captureException(error, context);
}
