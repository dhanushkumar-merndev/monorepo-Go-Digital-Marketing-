import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { MessagingRuntimeConfig } from './messaging-runtime-config.js';

export interface EncryptedMessagingCredentials {
  authTag: string;
  ciphertext: string;
  iv: string;
  keyId: string;
}

export interface MessagingCredentials {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
}

function unavailable(field = 'MESSAGING_CREDENTIAL_ENCRYPTION_KEY'): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'PROVIDER_UNAVAILABLE',
    details: [{ field, reason: 'Not configured for the requested key ID.' }],
    message: 'Messaging credential encryption is not configured.',
    retryable: false,
  });
}

export class MessagingCredentialProtector {
  constructor(private readonly config: MessagingRuntimeConfig) {}

  encrypt(credentials: MessagingCredentials): EncryptedMessagingCredentials {
    const key = this.config.credentialEncryptionKey;
    if (!key) throw unavailable();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return {
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      keyId: this.config.credentialKeyId,
    };
  }

  decrypt(value: EncryptedMessagingCredentials): MessagingCredentials {
    const key =
      value.keyId === this.config.credentialKeyId
        ? this.config.credentialEncryptionKey
        : this.config.credentialDecryptionKeys[value.keyId];
    if (!key) throw unavailable('MESSAGING_CREDENTIAL_DECRYPTION_KEYS');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plaintext) as MessagingCredentials;
    } catch {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message: 'Messaging credentials could not be decrypted.',
        retryable: false,
      });
    }
  }
}
