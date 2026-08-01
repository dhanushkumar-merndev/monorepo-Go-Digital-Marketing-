import nestConfig from '@gdm/eslint-config/nest';

export default [
  ...nestConfig,
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
