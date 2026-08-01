import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe.js';

class ExampleDto {
  name!: string;
  count!: number;

  static readonly schema = z.object({
    name: z.string().trim().min(2),
    count: z.coerce.number().int().positive(),
  });
}

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: ExampleDto,
};

describe('ZodValidationPipe', () => {
  it('returns parsed and transformed data from a DTO schema', () => {
    const pipe = new ZodValidationPipe();
    const result = pipe.transform({ name: '  valid  ', count: '2' }, bodyMetadata);

    assert.deepEqual(result, { name: 'valid', count: 2 });
  });

  it('returns structured field details for invalid data', () => {
    const pipe = new ZodValidationPipe();

    assert.throws(
      () => pipe.transform({ name: '', count: 0 }, bodyMetadata),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        const response = error.getResponse();

        assert.equal(typeof response, 'object');
        assert.equal((response as { code?: string }).code, 'VALIDATION_ERROR');
        assert.deepEqual(
          (response as { details?: { field: string }[] }).details?.map((detail) => detail.field),
          ['name', 'count'],
        );
        return true;
      },
    );
  });
});
