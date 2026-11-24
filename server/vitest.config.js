import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The cleanup helper deletes ALL test users, so test files must not run at the same time.
    fileParallelism: false,
    // Requests go to a remote database and bcrypt is deliberately slow.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});