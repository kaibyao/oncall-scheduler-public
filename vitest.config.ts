/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environment configuration
    environment: 'node',

    // Test file patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],

    // ES modules support
    globals: false, // Explicit imports for better tree-shaking

    // Test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true,
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        'packages/*/test{,s}/**',
        '**/*.d.ts',
        'cypress/**',
        'test{,s}/**',
        'test{,-*}.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
        'src/constants.ts', // Exclude constants file from coverage
      ],
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,

    // Watch mode
    watch: true,

    // Reporter configuration
    reporters: ['dot'],

    // Setup files (we'll create these)
    setupFiles: ['./test/setup.ts'],

    // Global test configuration
    logHeapUsage: true,
    allowOnly: !process.env.CI,
    passWithNoTests: false,

    // File-based isolation for integration tests
    isolate: true,

    // TypeScript configuration
    typecheck: {
      enabled: false, // We'll use tsc separately for type checking
    },
  },
});
