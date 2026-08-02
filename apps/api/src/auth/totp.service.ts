import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_CODE_BYTES = 12;

export interface TotpVerification {
  timeStep: number;
}

export interface VerifyTotpInput {
  code: string;
  lastAcceptedTimeStep?: number;
  now: Date;
  secret: string;
  window?: number;
}

export interface TotpParameters {
  algorithm?: 'sha1' | 'sha256' | 'sha512';
  digits?: number;
  periodSeconds?: number;
}

export function encodeBase32(value: Uint8Array): string {
  let accumulator = 0;
  let bitCount = 0;
  let encoded = '';

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bitCount += 8;

    while (bitCount >= 5) {
      bitCount -= 5;
      encoded += BASE32_ALPHABET[(accumulator >>> bitCount) & 31];
    }
  }

  if (bitCount > 0) {
    encoded += BASE32_ALPHABET[(accumulator << (5 - bitCount)) & 31];
  }

  return encoded;
}

export function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/[=\s-]/gu, '');

  if (normalized.length === 0 || [...normalized].some((character) => !BASE32_ALPHABET.includes(character))) {
    throw new Error('The TOTP secret is not valid Base32.');
  }

  let accumulator = 0;
  let bitCount = 0;
  const decoded: number[] = [];

  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character);
    bitCount += 5;

    if (bitCount >= 8) {
      bitCount -= 8;
      decoded.push((accumulator >>> bitCount) & 255);
    }
  }

  return Buffer.from(decoded);
}

export function generateTotp(
  secret: Uint8Array,
  timeStep: number,
  parameters: TotpParameters = {},
): string {
  const algorithm = parameters.algorithm ?? 'sha1';
  const digits = parameters.digits ?? 6;

  if (!Number.isSafeInteger(timeStep) || timeStep < 0) {
    throw new Error('The TOTP time step must be a non-negative safe integer.');
  }

  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new Error('TOTP digits must be between 6 and 10.');
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac(algorithm, secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary =
    ((digest[offset]! & 127) << 24) |
    ((digest[offset + 1]! & 255) << 16) |
    ((digest[offset + 2]! & 255) << 8) |
    (digest[offset + 3]! & 255);
  const modulus = 10 ** digits;

  return String(binary % modulus).padStart(digits, '0');
}

export function hashRecoveryCode(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalizeRecoveryCode(code), 'utf8').digest('hex');
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
}

@Injectable()
export class TotpService {
  createSecret(): string {
    return encodeBase32(randomBytes(20));
  }

  createRecoveryCodes(count = 10): string[] {
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error('Recovery-code count must be between 1 and 20.');
    }

    return Array.from({ length: count }, () => {
      const encoded = encodeBase32(randomBytes(RECOVERY_CODE_BYTES));
      return encoded.match(/.{1,4}/gu)?.join('-') ?? encoded;
    });
  }

  createUri(input: { accountName: string; issuer: string; secret: string }): string {
    const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
    const parameters = new URLSearchParams({
      algorithm: 'SHA1',
      digits: '6',
      issuer: input.issuer,
      period: '30',
      secret: input.secret,
    });
    return `otpauth://totp/${label}?${parameters.toString()}`;
  }

  verify(input: VerifyTotpInput): TotpVerification | undefined {
    if (!/^\d{6}$/u.test(input.code)) {
      return undefined;
    }

    const window = input.window ?? 1;
    if (!Number.isInteger(window) || window < 0 || window > 2) {
      throw new Error('The TOTP verification window must be between zero and two.');
    }

    const secret = decodeBase32(input.secret);
    const currentTimeStep = Math.floor(input.now.getTime() / 1_000 / 30);
    const presented = Buffer.from(input.code, 'ascii');
    let accepted: number | undefined;

    for (let offset = -window; offset <= window; offset += 1) {
      const candidateTimeStep = currentTimeStep + offset;
      if (
        candidateTimeStep < 0 ||
        (input.lastAcceptedTimeStep !== undefined &&
          candidateTimeStep <= input.lastAcceptedTimeStep)
      ) {
        continue;
      }

      const candidate = Buffer.from(generateTotp(secret, candidateTimeStep), 'ascii');
      if (candidate.length === presented.length && timingSafeEqual(candidate, presented)) {
        accepted = Math.max(accepted ?? candidateTimeStep, candidateTimeStep);
      }
    }

    return accepted === undefined ? undefined : { timeStep: accepted };
  }
}
