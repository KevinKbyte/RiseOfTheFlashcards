// Requirement: the persistence premise counts boots in key-value storage; each boot reads the
// stored count (base-10 integer), treats missing, unparseable or negative values as 0, adds one,
// stores it and returns it -- so a count of 2+ proves storage survived a reload.
import { describe, expect, it } from 'vitest';
import { BOOT_KEY, incrementBootCount, type KV } from '../src/probe/boot-counter.js';

class MemoryKV implements KV {
  readonly data = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }
  getItem(k: string): string | null {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

// Covers: SPIKE-d
describe('incrementBootCount', () => {
  it('uses the probe.bootCount key by default', () => {
    expect(BOOT_KEY).toBe('probe.bootCount');
  });

  it('starts at 1 on an empty store and persists the value as a string', () => {
    const kv = new MemoryKV();
    expect(incrementBootCount(kv)).toBe(1);
    expect(kv.getItem(BOOT_KEY)).toBe('1');
  });

  it('increments an existing count', () => {
    const kv = new MemoryKV({ [BOOT_KEY]: '1' });
    expect(incrementBootCount(kv)).toBe(2);
    expect(kv.getItem(BOOT_KEY)).toBe('2');
  });

  it('counts up across repeated boots', () => {
    const kv = new MemoryKV();
    incrementBootCount(kv);
    incrementBootCount(kv);
    expect(incrementBootCount(kv)).toBe(3);
    expect(kv.getItem(BOOT_KEY)).toBe('3');
  });

  it('treats garbage, empty and negative stored values as 0', () => {
    for (const stored of ['abc', '', '-3', 'NaN']) {
      const kv = new MemoryKV({ [BOOT_KEY]: stored });
      expect(incrementBootCount(kv), `stored=${JSON.stringify(stored)}`).toBe(1);
      expect(kv.getItem(BOOT_KEY)).toBe('1');
    }
  });

  it('honours a custom key and leaves the default key untouched', () => {
    const kv = new MemoryKV({ [BOOT_KEY]: '5', other: '9' });
    expect(incrementBootCount(kv, 'other')).toBe(10);
    expect(kv.getItem('other')).toBe('10');
    expect(kv.getItem(BOOT_KEY)).toBe('5');
  });
});
