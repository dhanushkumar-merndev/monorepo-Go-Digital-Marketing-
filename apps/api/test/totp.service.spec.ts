import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeBase32,
  encodeBase32,
  generateTotp,
  hashRecoveryCode,
  TotpService,
} from '../src/auth/totp.service.js';

describe('TOTP and MFA recovery primitives', () => {
  it('matches the RFC 6238 SHA-1 vector', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    const encoded = encodeBase32(secret);

    assert.deepEqual(decodeBase32(encoded), secret);
    assert.equal(generateTotp(secret, Math.floor(59 / 30), { digits: 8 }), '94287082');
  });

  it('accepts the bounded clock window once and rejects replayed time steps', () => {
    const service = new TotpService();
    const secret = encodeBase32(Buffer.alloc(20, 7));
    const now = new Date('2026-08-02T12:00:00.000Z');
    const previousStep = Math.floor(now.getTime() / 1_000 / 30) - 1;
    const code = generateTotp(decodeBase32(secret), previousStep);

    assert.deepEqual(service.verify({ code, now, secret }), { timeStep: previousStep });
    assert.equal(
      service.verify({ code, lastAcceptedTimeStep: previousStep, now, secret }),
      undefined,
    );
  });

  it('creates interoperable URI data and high-entropy, normalized recovery codes', () => {
    const service = new TotpService();
    const secret = service.createSecret();
    const uri = service.createUri({
      accountName: 'agency.admin@example.test',
      issuer: 'Go Digital CRM',
      secret,
    });
    const codes = service.createRecoveryCodes();

    assert.match(secret, /^[A-Z2-7]{32}$/u);
    assert.match(uri, /^otpauth:\/\/totp\//u);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.ok(codes.every((code) => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){4}$/u.test(code)));
    assert.equal(hashRecoveryCode('ABCD-EFGH', 'pepper'), hashRecoveryCode('abcd efgh', 'pepper'));
  });
});
