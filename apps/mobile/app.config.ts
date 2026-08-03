import type { ConfigContext, ExpoConfig } from 'expo/config';

const googlePluginName = 'react-native-nitro-google-signin';
const googleClientIdPattern = /^[a-z0-9-]+\.apps\.googleusercontent\.com$/iu;
const unconfiguredIosUrlScheme = 'com.googleusercontent.apps.google-auth-not-configured';

function pluginName(plugin: NonNullable<ExpoConfig['plugins']>[number]): string {
  return Array.isArray(plugin) ? (plugin[0] ?? '') : plugin;
}

export function googleIosUrlScheme(clientId: string | undefined): string | undefined {
  const normalized = clientId?.trim();
  if (!normalized) {
    return undefined;
  }

  if (!googleClientIdPattern.test(normalized)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google OAuth iOS client ID');
  }

  const identifier = normalized.slice(0, -'.apps.googleusercontent.com'.length);
  return `com.googleusercontent.apps.${identifier}`;
}

export function mobileAppConfig({ config }: ConfigContext): ExpoConfig {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (webClientId && !googleClientIdPattern.test(webClientId)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be a Google OAuth web client ID');
  }
  const iosUrlScheme = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (process.env.EAS_BUILD_PLATFORM !== undefined && !webClientId) {
    throw new Error('Native EAS builds require EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  }
  if (process.env.EAS_BUILD_PLATFORM === 'ios' && !iosUrlScheme) {
    throw new Error('iOS EAS builds require EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
  }
  const plugins = (config.plugins ?? []).filter(
    (plugin) => pluginName(plugin) !== googlePluginName,
  );

  plugins.push([googlePluginName, { iosUrlScheme: iosUrlScheme ?? unconfiguredIosUrlScheme }]);

  return {
    ...config,
    android: {
      ...config.android,
      package: 'in.godigitalmarketing.automobilecrm',
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'in.godigitalmarketing.automobilecrm',
      supportsTablet: false,
    },
    name: config.name ?? 'Go Digital Automobile CRM',
    plugins,
    scheme: 'gdmcrm',
    slug: config.slug ?? 'go-digital-automobile-crm',
  };
}

export default mobileAppConfig;
