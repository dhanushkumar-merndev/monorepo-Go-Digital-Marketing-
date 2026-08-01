import nextConfig from '@gdm/eslint-config/next';

const uiConfig = [
  ...nextConfig,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];

export default uiConfig;
