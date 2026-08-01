import { baseConfig } from './base.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
