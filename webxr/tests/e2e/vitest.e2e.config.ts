// E2E playthrough config: drives cards.html in headless Chromium with the IWER-emulated Quest 3.
// Separate from vitest.config.ts (tests/**/*.test.ts) so unit runs never pick up *.e2e.ts files.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    globalSetup: ['tests/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 120_000,
  },
});
