import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;
const DEFAULT_COST = 32_768;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const MAX_MEMORY = 128 * 1024 * 1024;

interface PasswordParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
}

function encode(parameters: PasswordParameters, salt: Buffer, derivedKey: Buffer): string {
  return [
    '',
    ALGORITHM,
    parameters.cost,
    parameters.blockSize,
    parameters.parallelization,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

function decode(
  encoded: string,
): { parameters: PasswordParameters; salt: Buffer; derivedKey: Buffer } | undefined {
  const [empty, algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, keyValue] =
    encoded.split('$');
  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);

  if (
    empty !== '' ||
    algorithm !== ALGORITHM ||
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    !saltValue ||
    !keyValue
  ) {
    return undefined;
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const derivedKey = Buffer.from(keyValue, 'base64url');

    if (salt.length < 16 || derivedKey.length !== KEY_LENGTH) {
      return undefined;
    }

    return {
      parameters: { cost, blockSize, parallelization },
      salt,
      derivedKey,
    };
  } catch {
    return undefined;
  }
}

@Injectable()
export class PasswordHasher {
  private readonly parameters: PasswordParameters = {
    cost: DEFAULT_COST,
    blockSize: DEFAULT_BLOCK_SIZE,
    parallelization: DEFAULT_PARALLELIZATION,
  };

  async hash(password: string, pepper: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.derive(password, pepper, salt, this.parameters);
    return encode(this.parameters, salt, derivedKey);
  }

  async verify(password: string, pepper: string, encoded: string): Promise<boolean> {
    const decoded = decode(encoded);

    if (!decoded) {
      await this.derive(password, pepper, Buffer.alloc(16), this.parameters);
      return false;
    }

    const candidate = await this.derive(password, pepper, decoded.salt, decoded.parameters);
    return timingSafeEqual(candidate, decoded.derivedKey);
  }

  private async derive(
    password: string,
    pepper: string,
    salt: Buffer,
    parameters: PasswordParameters,
  ): Promise<Buffer> {
    const value = Buffer.from(`${password}\u0000${pepper}`, 'utf8');
    const result = await new Promise<Buffer>((resolve, reject) => {
      nodeScrypt(
        value,
        salt,
        KEY_LENGTH,
        {
          N: parameters.cost,
          p: parameters.parallelization,
          r: parameters.blockSize,
          maxmem: MAX_MEMORY,
        },
        (error, derivedKey) => {
          if (error) {
            reject(error);
          } else {
            resolve(Buffer.from(derivedKey));
          }
        },
      );
    });
    return result;
  }
}
