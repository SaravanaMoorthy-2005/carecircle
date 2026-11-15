import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'functions/src/**/*.test.ts',
            'packages/shared/src/**/*.test.ts',
            'apps/web/src/**/*.test.tsx',
            'apps/web/src/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/domain.ts',
        'packages/shared/src/care.ts',
        'functions/src/domain/*.ts',
        'functions/src/encryption/*.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
