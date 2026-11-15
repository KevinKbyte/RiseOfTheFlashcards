// Resolves the dev server the e2e suite plays against and provides its base URL to the tests.
//
// Order: E2E_BASE_URL (explicit) -> this workspace's own live IWSDK dev runtime -> a fresh vite
// spawned on a free port. The IWSDK dev plugin allows ONE dev runtime per workspace root (a second
// vite fails with "This workspace already has a dev runtime"), so when this worktree already runs
// one it is reused: it serves this worktree's current files, never another checkout's code.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const READY_TIMEOUT_MS = 90_000;

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

let child: ChildProcess | undefined;

// Node may resolve localhost to ::1 only while vite listens on 127.0.0.1 (browsers try both), so
// probe IPv4 when the default lookup is refused.
async function httpStatus(url: string): Promise<number> {
  return (await httpStatusVia(url, 0)) || (await httpStatusVia(url, 4));
}

function httpStatusVia(url: string, family: 0 | 4): Promise<number> {
  return new Promise((done) => {
    const req = request(url, { rejectUnauthorized: false, timeout: 5000, family }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on('error', () => done(0));
    req.on('timeout', () => {
      req.destroy();
      done(0);
    });
    req.end();
  });
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => done(port));
    });
  });
}

function pidAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** This workspace's live dev runtime URL, if its owner pid is alive and it serves cards.html. */
async function liveWorkspaceRuntime(): Promise<string | undefined> {
  try {
    const session = JSON.parse(readFileSync(resolve(ROOT, '.iwsdk/runtime/session.json'), 'utf8'));
    if (resolve(String(session.workspaceRoot)).toLowerCase() !== ROOT.toLowerCase()) return undefined;
    if (!pidAlive(session.pid) || typeof session.localUrl !== 'string') return undefined;
    const base = session.localUrl.replace(/\/$/, '');
    return (await httpStatus(`${base}/cards.html`)) === 200 ? base : undefined;
  } catch {
    return undefined;
  }
}

async function spawnVite(): Promise<string> {
  const port = await freePort();
  const base = `https://localhost:${port}`;
  let output = '';
  let exited: number | null = null;
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, IWSDK_DEV_OPEN: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));
  child.on('exit', (code) => (exited = code ?? -1));
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`e2e: vite exited (${exited}) before serving:\n${output.slice(-2000)}`);
    if ((await httpStatus(`${base}/cards.html`)) === 200) return base;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`e2e: vite did not serve ${base}/cards.html in ${READY_TIMEOUT_MS} ms:\n${output.slice(-2000)}`);
}

export default async function setup({ provide }: { provide: (key: 'baseUrl', value: string) => void }) {
  const explicit = process.env.E2E_BASE_URL?.replace(/\/$/, '');
  const base = explicit ?? (await liveWorkspaceRuntime()) ?? (await spawnVite());
  console.log(`[e2e] playing against ${base}${child ? ' (spawned)' : ' (existing)'}`);
  provide('baseUrl', base);
  return () => {
    if (child && child.exitCode === null) child.kill();
  };
}
