import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ParsedOpaqueToken {
  recordId: string;
  secret: string;
}

export function createOpaqueToken(recordId: string): ParsedOpaqueToken & { token: string } {
  const secret = randomBytes(32).toString('base64url');
  return { recordId, secret, token: `${recordId}.${secret}` };
}

export function parseOpaqueToken(token: string): ParsedOpaqueToken | undefined {
  const separator = token.indexOf('.');

  if (separator <= 0 || separator === token.length - 1) {
    return undefined;
  }

  const recordId = token.slice(0, separator);
  const secret = token.slice(separator + 1);

  if (!IDENTIFIER_PATTERN.test(recordId) || !/^[A-Za-z0-9_-]{43}$/u.test(secret)) {
    return undefined;
  }

  return { recordId, secret };
}

export function hashOpaqueToken(secret: string, pepper: string): string {
  return createHmac('sha256', pepper).update(secret, 'utf8').digest('hex');
}

export function opaqueTokenHashMatches(actualHash: string, expectedHash: string): boolean {
  const actual = Buffer.from(actualHash, 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
