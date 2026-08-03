import { mobileGoogleAuthConfiguration } from '../auth/google-auth-environment';

describe('mobileGoogleAuthConfiguration', () => {
  it('enables Android with a public Web audience and never requires a provider secret', () => {
    expect(
      mobileGoogleAuthConfiguration(
        {
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
          GOOGLE_AUTH_WEB_CLIENT_SECRET: 'must-not-be-read-by-mobile',
        },
        'android',
      ),
    ).toEqual({
      available: true,
      webClientId: 'web-client.apps.googleusercontent.com',
    });
  });

  it('requires the platform iOS client in addition to the backend Web audience', () => {
    expect(
      mobileGoogleAuthConfiguration(
        { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com' },
        'ios',
      ),
    ).toMatchObject({
      available: false,
      unavailableReason: expect.stringContaining('iOS'),
    });

    expect(
      mobileGoogleAuthConfiguration(
        {
          EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client.apps.googleusercontent.com',
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
        },
        'ios',
      ),
    ).toEqual({
      available: true,
      iosClientId: 'ios-client.apps.googleusercontent.com',
      webClientId: 'web-client.apps.googleusercontent.com',
    });
  });

  it('fails a build configuration that contains a malformed public client ID', () => {
    expect(() =>
      mobileGoogleAuthConfiguration(
        { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'not-a-google-client' },
        'android',
      ),
    ).toThrow('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be a Google OAuth client ID');
  });
});
