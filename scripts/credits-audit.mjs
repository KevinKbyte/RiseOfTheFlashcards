#!/usr/bin/env node
// CRED-001/002: list every non-code asset file not credited in CREDITS.md.
//
// Usage: node scripts/credits-audit.mjs [--repo <dir>] [--root <dir>]... [--credits <file>]
//   --repo     repo root (default: this script's parent directory)
//   --root     asset root relative to the repo; repeatable; replaces the defaults
//   --credits  credits file (default: <repo>/CREDITS.md)
// Exit: 0 all covered (or no asset root exists), 1 uncovered files listed, 2 credits
// file missing or bad arguments.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOTS = ['Assets', 'Content'];
// Unreal *.Build.cs / *.Target.cs are covered by .cs.
const SKIPPED_EXTENSIONS = new Set(['.cs', '.meta', '.asmdef', '.asmref', '.cpp', '.h', '.hpp', '.c']);

function usageError(message) {
  console.error(`credits-audit: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { repo: resolve(dirname(fileURLToPath(import.meta.url)), '..'), roots: [], credits: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--repo', '--root', '--credits'].includes(flag)) usageError(`unknown argument ${flag}`);
    if (value === undefined) usageError(`${flag} needs a value`);
    i += 1;
    if (flag === '--repo') options.repo = resolve(value);
    else if (flag === '--root') options.roots.push(value);
    else options.credits = value;
  }
  return options;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// Backticked spans: exact paths, or directory prefixes when they end in "/".
function parseCredits(text) {
  const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  return {
    exact: new Set(spans.filter((s) => !s.endsWith('/'))),
    prefixes: spans.filter((s) => s.endsWith('/')),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const creditsPath = resolve(options.repo, options.credits ?? 'CREDITS.md');
  if (!existsSync(creditsPath)) {
    console.error(`credits-audit: credits file not found: ${creditsPath}`);
    process.exit(2);
  }
  const { exact, prefixes } = parseCredits(readFileSync(creditsPath, 'utf8'));

  const roots = (options.roots.length > 0 ? options.roots : DEFAULT_ROOTS)
    .map((root) => resolve(options.repo, root))
    .filter((root) => existsSync(root) && statSync(root).isDirectory());

  const uncovered = roots
    .flatMap(listFiles)
    .filter((file) => !SKIPPED_EXTENSIONS.has(extname(file).toLowerCase()))
    .map((file) => relative(options.repo, file).split(sep).join('/'))
    .filter((path) => !exact.has(path) && !prefixes.some((prefix) => path.startsWith(prefix)))
    .sort();

  if (uncovered.length === 0) {
    console.log('credits-audit: every asset file is credited.');
    return;
  }
  console.log(`credits-audit: ${uncovered.length} asset file(s) not credited in ${relative(options.repo, creditsPath)}:`);
  for (const path of uncovered) console.log(`  ${path}`);
  process.exitCode = 1;
}

main();
