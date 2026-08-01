import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import { baseConfig } from './base.mjs';

export default [
  ...baseConfig,
  ...nextVitals,
  ...nextTypescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },
];
