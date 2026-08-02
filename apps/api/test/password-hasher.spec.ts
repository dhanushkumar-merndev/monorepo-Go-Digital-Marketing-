import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PasswordHasher } from '../src/auth/password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('creates salted scrypt hashes and verifies only the correct password and pepper', async () => {
    const first = await hasher.hash('Correct horse battery staple!7', 'test-pepper-value');
    const second = await hasher.hash('Correct horse battery staple!7', 'test-pepper-value');

    assert.notEqual(first, second);
    assert.equal(
      await hasher.verify('Correct horse battery staple!7', 'test-pepper-value', first),
      true,
    );
    assert.equal(await hasher.verify('wrong password', 'test-pepper-value', first), false);
    assert.equal(
      await hasher.verify('Correct horse battery staple!7', 'wrong-pepper-value', first),
      false,
    );
  });

  it('fails closed for malformed stored hashes while still exercising scrypt', async () => {
    assert.equal(await hasher.verify('any password', 'test-pepper-value', 'not-a-hash'), false);
  });
});
