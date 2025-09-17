import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-console': 'error',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
