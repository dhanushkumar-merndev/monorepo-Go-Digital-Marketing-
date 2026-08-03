import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiEnvironment } from '@gdm/config';
import { createPinoHttpOptions } from '../src/observability/pino-options.js';

describe('structured-log redaction', () => {
  it('removes both supported Google ID token body field spellings', () => {
    const options = createPinoHttpOptions({ logLevel: 'silent' } as ApiEnvironment) as unknown as {
      redact?: { paths?: readonly string[] };
    };
    const paths = options.redact?.paths ?? [];
    assert.ok(Array.isArray(paths));
    assert.equal(paths.includes('req.body.id_token'), true);
    assert.equal(paths.includes('req.body.idToken'), true);
  });
});
