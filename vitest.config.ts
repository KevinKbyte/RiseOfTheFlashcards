// Standalone on purpose: importing vite.config.ts pulls in the IWSDK dev plugin, which crashes
// under vitest (RuntimeOwnerError).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
