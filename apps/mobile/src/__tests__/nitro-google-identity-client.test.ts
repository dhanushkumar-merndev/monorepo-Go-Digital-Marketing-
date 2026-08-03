import type { GoogleIdentityError } from '../auth/google-identity-client';
import {
  NitroGoogleIdentityClient,
  type NitroGoogleSignInPort,
} from '../auth/nitro-google-identity-client';

function providerFixture(): jest.Mocked<NitroGoogleSignInPort> {
  return {
    checkPlayServices: jest.fn<
      ReturnType<NitroGoogleSignInPort['checkPlayServices']>,
      Parameters<NitroGoogleSignInPort['checkPlayServices']>
    >(async () => undefined),
    configure: jest.fn<
      ReturnType<NitroGoogleSignInPort['configure']>,
      Parameters<NitroGoogleSignInPort['configure']>
    >(),
    createAccount: jest.fn<
      ReturnType<NitroGoogleSignInPort['createAccount']>,
      Parameters<NitroGoogleSignInPort['createAccount']>
    >(async () => ({ data: { idToken: 'google-id-token' }, type: 'success' })),
    presentExplicitSignIn: jest.fn<
      ReturnType<NitroGoogleSignInPort['presentExplicitSignIn']>,
      Parameters<NitroGoogleSignInPort['presentExplicitSignIn']>
    >(async () => ({ data: null, type: 'cancelled' })),
    signIn: jest.fn<
      ReturnType<NitroGoogleSignInPort['signIn']>,
      Parameters<NitroGoogleSignInPort['signIn']>
    >(async () => ({ data: null, type: 'noSavedCredentialFound' })),
    signOut: jest.fn<
      ReturnType<NitroGoogleSignInPort['signOut']>,
      Parameters<NitroGoogleSignInPort['signOut']>
    >(async () => undefined),
  };
}

describe('NitroGoogleIdentityClient', () => {
  it('uses a server challenge nonce and returns only the provider ID token', async () => {
    const provider = providerFixture();
    const client = new NitroGoogleIdentityClient(
      {
        iosClientId: 'ios-client.apps.googleusercontent.com',
        webClientId: 'web-client.apps.googleusercontent.com',
      },
      provider,
    );

    await expect(client.authenticate({ nonce: 'a'.repeat(64) })).resolves.toEqual({
      idToken: 'google-id-token',
      status: 'success',
    });

    expect(provider.configure).toHaveBeenCalledWith({
      autoSelectOnSignIn: false,
      iosClientId: 'ios-client.apps.googleusercontent.com',
      nonce: 'a'.repeat(64),
      offlineAccess: false,
      webClientId: 'web-client.apps.googleusercontent.com',
    });
    expect(provider.checkPlayServices).toHaveBeenCalledWith(true);
    expect(provider.signIn).toHaveBeenCalledTimes(1);
    expect(provider.createAccount).toHaveBeenCalledTimes(1);
    expect(provider.presentExplicitSignIn).not.toHaveBeenCalled();
  });

  it('treats a dismissed provider sheet as cancellation without attempting CRM login', async () => {
    const provider = providerFixture();
    provider.signIn.mockResolvedValueOnce({ data: null, type: 'cancelled' });
    const client = new NitroGoogleIdentityClient(
      { webClientId: 'web-client.apps.googleusercontent.com' },
      provider,
    );

    await expect(client.authenticate({ nonce: 'b'.repeat(64) })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(provider.createAccount).not.toHaveBeenCalled();
  });

  it('falls back to the explicit provider surface when no saved credential is available', async () => {
    const provider = providerFixture();
    provider.createAccount.mockResolvedValueOnce({
      data: null,
      type: 'noSavedCredentialFound',
    });
    provider.presentExplicitSignIn.mockResolvedValueOnce({
      data: { idToken: 'explicit-id-token' },
      type: 'success',
    });
    const client = new NitroGoogleIdentityClient(
      { webClientId: 'web-client.apps.googleusercontent.com' },
      provider,
    );

    await expect(client.authenticate({ nonce: 'c'.repeat(64) })).resolves.toEqual({
      idToken: 'explicit-id-token',
      status: 'success',
    });
    expect(provider.presentExplicitSignIn).toHaveBeenCalledTimes(1);
  });

  it('maps native configuration errors without exposing provider details', async () => {
    const provider = providerFixture();
    provider.checkPlayServices.mockRejectedValueOnce({
      code: 'DEVELOPER_ERROR',
      message: 'sensitive native detail',
    });
    const client = new NitroGoogleIdentityClient(
      { webClientId: 'web-client.apps.googleusercontent.com' },
      provider,
    );

    await expect(client.authenticate({ nonce: 'd'.repeat(64) })).rejects.toEqual(
      expect.objectContaining<Partial<GoogleIdentityError>>({
        message: 'Google identity authentication failed',
        reason: 'CONFIGURATION',
      }),
    );
  });
});
