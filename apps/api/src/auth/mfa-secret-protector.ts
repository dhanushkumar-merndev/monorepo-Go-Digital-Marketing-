import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export interface ProtectedMfaSecret {
  ciphertext: string;
  keyId: string;
  nonce: string;
  tag: string;
}

function decodeKey(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error('Every MFA encryption key must decode to exactly 32 bytes.');
  }
  return decoded;
}

export class MfaSecretProtector {
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(
    private readonly activeKeyId: string,
    encodedKeys: Readonly<Record<string, string>>,
  ) {
    const entries = Object.entries(encodedKeys).map(([keyId, encoded]) => [
      keyId,
      decodeKey(encoded),
    ] as const);
    this.keys = new Map(entries);

    if (!this.keys.has(activeKeyId)) {
      throw new Error('AUTH_MFA_ACTIVE_KEY_ID must identify a configured encryption key.');
    }
  }

  protect(secret: string, associatedData: string): ProtectedMfaSecret {
    const key = this.keys.get(this.activeKeyId)!;
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      keyId: this.activeKeyId,
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  unprotect(protectedSecret: ProtectedMfaSecret, associatedData: string): string {
    const key = this.keys.get(protectedSecret.keyId);
    if (!key) {
      throw new Error('The MFA secret references an unavailable encryption key.');
    }

    const nonce = Buffer.from(protectedSecret.nonce, 'base64');
    const tag = Buffer.from(protectedSecret.tag, 'base64');
    if (nonce.length !== NONCE_BYTES || tag.length !== 16) {
      throw new Error('The protected MFA secret is malformed.');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(protectedSecret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
