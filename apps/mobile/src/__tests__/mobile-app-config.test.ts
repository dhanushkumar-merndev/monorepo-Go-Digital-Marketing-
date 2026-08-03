import type { ConfigContext, ExpoConfig } from 'expo/config';

import appConfig from '../../app.json';
import { googleIosUrlScheme, mobileAppConfig } from '../../app.config';
import easConfig from '../../eas.json';

describe('mobile Google native application configuration', () => {
  const previousIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const previousWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const previousBuildPlatform = process.env.EAS_BUILD_PLATFORM;

  afterEach(() => {
    if (previousIosClientId === undefined) {
      Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = previousIosClientId;
    }
    if (previousWebClientId === undefined)
      Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    else process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = previousWebClientId;
    if (previousBuildPlatform === undefined)
      Reflect.deleteProperty(process.env, 'EAS_BUILD_PLATFORM');
    else process.env.EAS_BUILD_PLATFORM = previousBuildPlatform;
  });

  it('binds development, preview, and production builds to separate EAS environments', () => {
    expect(easConfig.build).toEqual({
      development: {
        developmentClient: true,
        distribution: 'internal',
        environment: 'development',
      },
      preview: { distribution: 'internal', environment: 'preview' },
      production: { environment: 'production' },
    });
  });

  it('keeps stable Android/iOS identifiers and the app-only deep-link scheme', () => {
    expect(appConfig.expo.android.package).toBe('in.godigitalmarketing.automobilecrm');
    expect(appConfig.expo.ios).toEqual({
      bundleIdentifier: 'in.godigitalmarketing.automobilecrm',
      supportsTablet: false,
    });
    expect(appConfig.expo.scheme).toBe('gdmcrm');
    expect(JSON.stringify(appConfig)).not.toContain('gdmcrm://auth/google');
    expect(appConfig.expo.plugins).toContain('react-native-nitro-google-signin');
  });

  it('derives the environment-specific iOS callback scheme from its OAuth client ID', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = '123456789-mobile.apps.googleusercontent.com';

    const resolved = mobileAppConfig({
      config: appConfig.expo as ExpoConfig,
    } as ConfigContext);
    const googlePlugin = resolved.plugins?.find((plugin) =>
      Array.isArray(plugin)
        ? plugin[0] === 'react-native-nitro-google-signin'
        : plugin === 'react-native-nitro-google-signin',
    );

    expect(googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)).toBe(
      'com.googleusercontent.apps.123456789-mobile',
    );
    expect(googlePlugin).toEqual([
      'react-native-nitro-google-signin',
      { iosUrlScheme: 'com.googleusercontent.apps.123456789-mobile' },
    ]);
  });

  it('rejects an invalid iOS OAuth client instead of emitting an unsafe URL scheme', () => {
    expect(() => googleIosUrlScheme('invalid-client')).toThrow(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google OAuth iOS client ID',
    );
  });

  it('uses a non-functional URL scheme only so Android and JS exports remain buildable', () => {
    Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');

    const resolved = mobileAppConfig({ config: appConfig.expo as ExpoConfig } as ConfigContext);

    expect(resolved.plugins).toContainEqual([
      'react-native-nitro-google-signin',
      { iosUrlScheme: 'com.googleusercontent.apps.google-auth-not-configured' },
    ]);
  });

  it('fails closed when any EAS iOS build has no iOS OAuth client', () => {
    Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456789-web.apps.googleusercontent.com';
    process.env.EAS_BUILD_PLATFORM = 'ios';

    expect(() =>
      mobileAppConfig({ config: appConfig.expo as ExpoConfig } as ConfigContext),
    ).toThrow('iOS EAS builds require EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
  });

  it('fails closed when any native EAS build has no web/server OAuth client', () => {
    Reflect.deleteProperty(process.env, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    process.env.EAS_BUILD_PLATFORM = 'android';

    expect(() =>
      mobileAppConfig({ config: appConfig.expo as ExpoConfig } as ConfigContext),
    ).toThrow('Native EAS builds require EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  });
});
