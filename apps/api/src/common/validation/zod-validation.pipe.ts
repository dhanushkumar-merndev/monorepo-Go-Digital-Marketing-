import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import type { ApiErrorDetail } from '@gdm/contracts';
import type { ZodType } from 'zod';

type ZodBackedType = Type<unknown> & {
  schema?: ZodType;
};

function parseWithSchema(schema: ZodType, value: unknown, metadata: ArgumentMetadata): unknown {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const details: ApiErrorDetail[] = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : (metadata.data ?? 'request'),
    reason: issue.message,
  }));

  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed.',
    details,
    retryable: false,
  });
}

/** Explicit-schema variant used at controller boundaries so validation remains
 * active even in transpilers that omit TypeScript decorator metadata. */
export class ZodSchemaValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    return parseWithSchema(this.schema, value, metadata);
  }
}

/**
 * Global request validation for DTO classes that expose a static Zod schema.
 * Shared contract packages can create DTO shells without introducing
 * class-validator as a second source of validation truth.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as ZodBackedType | undefined)?.schema;

    if (!schema) {
      return value;
    }

    return parseWithSchema(schema, value, metadata);
  }
}
