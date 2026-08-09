import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MessagingEnvironment } from '@gdm/config';
import { MessagingCredentialProtector } from '../src/messaging/messaging-credential-protector.js';

const config = (overrides: Partial<MessagingEnvironment> = {}): MessagingEnvironment => ({
  credentialDecryptionKeys: {},
  credentialEncryptionKey: Buffer.alloc(32, 7),
  credentialKeyId: 'messaging-current',
  developmentAdapterEnabled: false,
  developmentWebhookSecret: 'test-development-webhook-secret-at-least-32-characters',
  mediaMaxBytes: 26_214_400,
  mediaRetentionDays: 365,
  mediaUrlTtlSeconds: 300,
  outboundMaxAttempts: 5,
  serviceWindowHours: 24,
  webhookRawRetentionHours: 168,
  ...overrides,
});

test('messaging credentials encrypt and decrypt with the active key', () => {
  const protector = new MessagingCredentialProtector(config());
  const credentials = {
    accessToken: 'access-token',
    appSecret: 'app-secret',
    verifyToken: 'verify-token',
  };

  const encrypted = protector.encrypt(credentials);

  assert.equal(encrypted.keyId, 'messaging-current');
  assert.deepEqual(protector.decrypt(encrypted), credentials);
});

test('messaging credentials encrypted under a previous key remain decryptable during rotation', () => {
  const previousKey = Buffer.alloc(32, 6);
  const previousProtector = new MessagingCredentialProtector(
    config({ credentialEncryptionKey: previousKey, credentialKeyId: 'messaging-previous' }),
  );
  const encrypted = previousProtector.encrypt({
    accessToken: 'old-access-token',
    appSecret: 'old-app-secret',
    verifyToken: 'old-verify-token',
  });
  const rotatedProtector = new MessagingCredentialProtector(
    config({ credentialDecryptionKeys: { 'messaging-previous': previousKey } }),
  );

  assert.equal(rotatedProtector.decrypt(encrypted).accessToken, 'old-access-token');
});

test('messaging credential decryption fails closed for an unknown key ID', () => {
  const encrypted = new MessagingCredentialProtector(
    config({ credentialKeyId: 'messaging-unknown' }),
  ).encrypt({ accessToken: 'a', appSecret: 'b', verifyToken: 'c' });

  assert.throws(
    () => new MessagingCredentialProtector(config()).decrypt(encrypted),
    /Messaging credential encryption is not configured/u,
  );
});
