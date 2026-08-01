import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import globals from 'globals';

import { baseConfig } from './base.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-native': reactNative,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...reactNative.configs.all.rules,
      'react-native/no-color-literals': 'off',
      'react-native/no-inline-styles': 'off',
      'react-native/sort-styles': 'off',
    },
  },
];
