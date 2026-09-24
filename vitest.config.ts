import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    isolate: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
