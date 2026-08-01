import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import turbo from 'eslint-plugin-turbo';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const baseConfig = tseslint.config(
  {
    ignores: [
      '**/.expo/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/android/**',
      '**/coverage/**',
      '**/dist/**',
      '**/ios/**',
      '**/node_modules/**',
      '**/web-build/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      turbo,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...turbo.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
  prettier,
);

export default baseConfig;
