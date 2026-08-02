import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createOpaqueToken,
  hashOpaqueToken,
  opaqueTokenHashMatches,
  parseOpaqueToken,
} from '../src/auth/opaque-token.js';

describe('opaque tokens', () => {
  it('round-trips a record id and keeps only a keyed hash suitable for persistence', () => {
    const generated = createOpaqueToken(randomUUID());
    const parsed = parseOpaqueToken(generated.token);

    assert.deepEqual(parsed, { recordId: generated.recordId, secret: generated.secret });

    const hash = hashOpaqueToken(generated.secret, 'test-pepper');
    assert.equal(
      opaqueTokenHashMatches(hashOpaqueToken(parsed!.secret, 'test-pepper'), hash),
      true,
    );
    assert.equal(hash.includes(generated.secret), false);
  });

  it('rejects malformed tokens without throwing', () => {
    assert.equal(parseOpaqueToken(''), undefined);
    assert.equal(parseOpaqueToken('not-an-id.secret'), undefined);
    assert.equal(parseOpaqueToken(`${randomUUID()}.short`), undefined);
  });

  it('rejects UUID-shaped garbage before it can reach a PostgreSQL UUID comparison', () => {
    assert.equal(parseOpaqueToken(`${'-'.repeat(36)}.${'a'.repeat(43)}`), undefined);
  });
});
