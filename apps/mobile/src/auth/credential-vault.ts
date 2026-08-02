import * as SecureStore from 'expo-secure-store';

import {
  credentialVaultVersion,
  parseStoredMobileSession,
  type MobileSession,
  type StoredMobileSession,
} from './auth-types';

const credentialVaultKey = 'gdm.mobile.authentication.v1';

export interface SecureKeyValueStore {
  deleteItemAsync(key: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
}

export interface CredentialVault {
  clear(): Promise<void>;
  load(): Promise<MobileSession | null>;
  save(session: MobileSession): Promise<void>;
}

export class CredentialVaultError extends Error {
  constructor(operation: 'clear' | 'load' | 'save', options?: ErrorOptions) {
    super(`Secure credential ${operation} failed`, options);
    this.name = 'CredentialVaultError';
  }
}

const secureStoreAdapter: SecureKeyValueStore = {
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value, options) => SecureStore.setItemAsync(key, value, options),
};

export class SecureStoreCredentialVault implements CredentialVault {
  constructor(private readonly store: SecureKeyValueStore = secureStoreAdapter) {}

  async clear(): Promise<void> {
    try {
      await this.store.deleteItemAsync(credentialVaultKey);
    } catch (error: unknown) {
      throw new CredentialVaultError('clear', { cause: error });
    }
  }

  async load(): Promise<MobileSession | null> {
    let serialized: string | null;

    try {
      serialized = await this.store.getItemAsync(credentialVaultKey);
    } catch (error: unknown) {
      throw new CredentialVaultError('load', { cause: error });
    }

    if (serialized === null) {
      return null;
    }

    try {
      const stored = parseStoredMobileSession(JSON.parse(serialized) as unknown);
      if (stored) {
        return stored.session;
      }
    } catch {
      // Corrupt or obsolete credentials fail closed and are removed below.
    }

    await this.clear();
    return null;
  }

  async save(session: MobileSession): Promise<void> {
    const stored: StoredMobileSession = {
      session,
      version: credentialVaultVersion,
    };

    try {
      await this.store.setItemAsync(credentialVaultKey, JSON.stringify(stored), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } catch (error: unknown) {
      throw new CredentialVaultError('save', { cause: error });
    }
  }
}

export { credentialVaultKey };
