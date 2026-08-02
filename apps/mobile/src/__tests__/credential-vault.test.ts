import * as SecureStore from 'expo-secure-store';

import {
  SecureStoreCredentialVault,
  credentialVaultKey,
  type SecureKeyValueStore,
} from '../auth/credential-vault';
import { sessionFixture } from './auth-test-fixtures';

describe('SecureStoreCredentialVault', () => {
  it('persists one versioned credential bundle with device-only accessibility', async () => {
    const values = new Map<string, string>();
    const store: SecureKeyValueStore = {
      deleteItemAsync: jest.fn(async (key) => {
        values.delete(key);
      }),
      getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
      setItemAsync: jest.fn(async (key, value) => {
        values.set(key, value);
      }),
    };
    const vault = new SecureStoreCredentialVault(store);
    const session = sessionFixture();

    await vault.save(session);

    expect(store.setItemAsync).toHaveBeenCalledWith(
      credentialVaultKey,
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }),
    );
    expect(JSON.parse(values.get(credentialVaultKey) ?? '{}')).toMatchObject({
      session: { credentials: { refreshToken: 'refresh-token-one' } },
      version: 1,
    });
    await expect(vault.load()).resolves.toEqual(session);
  });

  it('fails closed and deletes corrupt or obsolete stored values', async () => {
    const store: SecureKeyValueStore = {
      deleteItemAsync: jest.fn(async () => undefined),
      getItemAsync: jest.fn(async () => '{"version":999,"refresh_token":"unsafe"}'),
      setItemAsync: jest.fn(async () => undefined),
    };
    const vault = new SecureStoreCredentialVault(store);

    await expect(vault.load()).resolves.toBeNull();
    expect(store.deleteItemAsync).toHaveBeenCalledWith(credentialVaultKey);
  });
});
