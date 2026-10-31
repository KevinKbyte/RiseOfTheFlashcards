/**
 * Boot counter persisted in a key-value store (localStorage in the app).
 */

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const BOOT_KEY = 'probe.bootCount';

export function incrementBootCount(store: KV, key = BOOT_KEY): number {
  const raw = store.getItem(key);
  // Only plain digit strings count; '2.5', '-3', '', '3abc' reset to 0 rather than being half-trusted.
  const previous = raw != null && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  const next = previous + 1;
  store.setItem(key, String(next));
  return next;
}
