// Launcher for tests/e2e/capture-video.ts (emulator gameplay video). Bundles the TypeScript script
// with esbuild into node_modules/.cache (dependencies stay external) and runs it, so no ts runner
// is needed. Not an *.e2e.ts file: `npm run test:e2e` never picks it up.
//
// Run (from the repo root, Git Bash):
//   CAPTURE_DIR=/abs/output/dir node tests/e2e/capture-video.mjs
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(root, 'node_modules/.cache/capture-video/capture-video.mjs');

await build({
  entryPoints: [resolve(here, 'capture-video.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node20',
  outfile: out,
  logLevel: 'warning',
  // Every bundled module lives in tests/e2e; keep their import.meta.url-relative repo paths right.
  define: { 'import.meta.url': JSON.stringify(pathToFileURL(resolve(here, 'capture-video.ts')).href) },
});
const { main } = await import(pathToFileURL(out).href);
process.exitCode = await main();
