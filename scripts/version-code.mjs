#!/usr/bin/env node
// BUILD-001..003: strictly increasing Android versionCode counter.
//
// Usage: node scripts/version-code.mjs next --state <file> [--ini <DefaultEngine.ini>]
//   --state  JSON state file {"versionCode":N}; a missing file counts as N=0
//   --ini    optional Unreal DefaultEngine.ini whose StoreVersion is set to N+1
// Prints N+1. Exit: 0 success, 1 corrupt state or missing ini (nothing written),
// 2 bad arguments.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Google Play's maximum versionCode.
const PLAY_MAX = 2100000000;
const SECTION = '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]';
const USAGE = 'usage: node scripts/version-code.mjs next --state <file> [--ini <DefaultEngine.ini>]';

function usageError(message) {
  console.error(`version-code: ${message}\n${USAGE}`);
  process.exit(2);
}

function fail(message) {
  console.error(`version-code: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'next') usageError(command === undefined ? 'missing subcommand' : `unknown subcommand ${command}`);
  const options = { state: null, ini: null };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag !== '--state' && flag !== '--ini') usageError(`unknown argument ${flag}`);
    if (value === undefined) usageError(`${flag} needs a value`);
    options[flag.slice(2)] = value;
  }
  if (options.state === null) usageError('--state is required');
  return options;
}

function readCounter(statePath) {
  if (!existsSync(statePath)) return 0;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    fail(`corrupt state file (not valid JSON): ${statePath}`);
  }
  const n = parsed !== null && typeof parsed === 'object' ? parsed.versionCode : undefined;
  if (!Number.isInteger(n) || n < 0) fail(`corrupt state file (versionCode must be a non-negative integer): ${statePath}`);
  // N+1 must stay within the Play max.
  if (n >= PLAY_MAX) fail(`versionCode ${n} cannot advance past the Google Play max ${PLAY_MAX}: ${statePath}`);
  return n;
}

// Sets StoreVersion inside SECTION, leaving every other byte as-is.
function setStoreVersion(text, version) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const entry = `StoreVersion=${version}`;
  // Each element keeps its own line terminator so join('') restores the original bytes.
  const lines = text.split(/(?<=\n)/);
  const bodyOf = (line) => line.replace(/\r?\n$/, '');
  const headerIndex = lines.findIndex((line) => bodyOf(line).trim() === SECTION);

  if (headerIndex === -1) {
    const separator = text === '' || text.endsWith('\n') ? '' : eol;
    return `${text}${separator}${SECTION}${eol}${entry}${eol}`;
  }

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const body = bodyOf(lines[i]);
    if (body.trim().startsWith('[')) break;
    if (/^\s*StoreVersion\s*=/.test(body)) {
      lines[i] = entry + lines[i].slice(body.length);
      return lines.join('');
    }
  }
  if (!lines[headerIndex].endsWith('\n')) lines[headerIndex] += eol;
  lines.splice(headerIndex + 1, 0, `${entry}${eol}`);
  return lines.join('');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const next = readCounter(options.state) + 1;

  if (options.ini !== null) {
    if (!existsSync(options.ini)) fail(`ini file not found: ${options.ini}`);
    writeFileSync(options.ini, setStoreVersion(readFileSync(options.ini, 'utf8'), next));
  }
  writeFileSync(options.state, `${JSON.stringify({ versionCode: next })}\n`);
  console.log(String(next));
}

main();
