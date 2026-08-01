import nextConfig from '@gdm/eslint-config/next';

const eslintConfig = [
  {
    ignores: ['.open-next/**', '.wrangler/**', 'cloudflare-env.d.ts'],
  },
  ...nextConfig,
];

export default eslintConfig;
