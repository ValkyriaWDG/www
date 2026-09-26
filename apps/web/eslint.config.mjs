import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/cli/**', 'scripts/**', 'e2e/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores(['.next/**', '.next-*/**', 'dist/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
]);
