import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    testTimeout: 15000,
    coverage: { provider: 'v8', include: ['js/**/*.js'] }
  }
});
