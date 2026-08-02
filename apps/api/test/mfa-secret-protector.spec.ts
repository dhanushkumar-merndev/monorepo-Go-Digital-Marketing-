import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MfaSecretProtector } from '../src/auth/mfa-secret-protector.js';

const key = Buffer.alloc(32, 11).toString('base64');

describe('MFA secret protection', () => {
  it('encrypts with authenticated associated data and decrypts with the configured key', () => {
    const protector = new MfaSecretProtector('primary', { primary: key });
    const protectedSecret = protector.protect('BASE32SECRET', 'user-1:factor-1:TOTP');

    assert.notEqual(protectedSecret.ciphertext, 'BASE32SECRET');
    assert.equal(
      protector.unprotect(protectedSecret, 'user-1:factor-1:TOTP'),
      'BASE32SECRET',
    );
  });

  it('fails closed when ciphertext or associated data is changed', () => {
    const protector = new MfaSecretProtector('primary', { primary: key });
    const protectedSecret = protector.protect('BASE32SECRET', 'user-1:factor-1:TOTP');

    assert.throws(() => protector.unprotect(protectedSecret, 'user-2:factor-1:TOTP'));
    assert.throws(() =>
      protector.unprotect(
        { ...protectedSecret, ciphertext: Buffer.from('tampered').toString('base64') },
        'user-1:factor-1:TOTP',
      ),
    );
  });
});
