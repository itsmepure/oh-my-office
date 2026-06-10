import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Map workspace package subpath imports to source files in dev/test.
      // Production builds use the built dist/ via the package.json `exports` map.
      '@repo/db/auth': path.resolve(__dirname, '../../packages/db/src/auth.ts'),
      '@repo/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@repo/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
});
