import reactNativeConfig from '@gdm/eslint-config/react-native';

export default reactNativeConfig.map((config) => {
  if (!config.plugins?.['react-native']) {
    return config;
  }

  return {
    ...config,
    rules: {
      ...config.rules,
      'react-native/no-raw-text': ['error', { skip: ['AppText'] }],
    },
  };
});
