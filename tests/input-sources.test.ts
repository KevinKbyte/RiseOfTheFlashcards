// Requirement: the probe sorts XR input sources into hands vs controllers by whether the
// source carries a non-null hand, keeping each source's handedness in arrival order, so the
// input premise can tell hand tracking apart from controllers.
import { describe, expect, it } from 'vitest';
import { classifyInputSources } from '../src/probe/input-sources.js';

// Covers: SPIKE-c
describe('classifyInputSources', () => {
  it('returns empty lists for no sources', () => {
    expect(classifyInputSources([])).toEqual({ hands: [], controllers: [] });
  });

  it('puts sources with a non-null hand into hands', () => {
    const r = classifyInputSources([
      { hand: {}, handedness: 'left' },
      { hand: { size: 25 }, handedness: 'right' },
    ]);
    expect(r).toEqual({ hands: ['left', 'right'], controllers: [] });
  });

  it('puts sources with a null or missing hand into controllers', () => {
    const r = classifyInputSources([
      { hand: null, handedness: 'right' },
      { handedness: 'left' },
      { hand: undefined, handedness: 'none' },
    ]);
    expect(r).toEqual({ hands: [], controllers: ['right', 'left', 'none'] });
  });

  it('preserves arrival order within each group for mixed input', () => {
    const r = classifyInputSources([
      { hand: null, handedness: 'right' },
      { hand: {}, handedness: 'right' },
      { hand: null, handedness: 'left' },
      { hand: {}, handedness: 'left' },
    ]);
    expect(r).toEqual({ hands: ['right', 'left'], controllers: ['right', 'left'] });
  });

  it('accepts any iterable, not just arrays', () => {
    function* gen(): Generator<{ hand?: unknown; handedness: string }> {
      yield { hand: {}, handedness: 'left' };
      yield { hand: null, handedness: 'right' };
    }
    expect(classifyInputSources(gen())).toEqual({ hands: ['left'], controllers: ['right'] });
    const set = new Set([{ hand: null, handedness: 'left' }]);
    expect(classifyInputSources(set)).toEqual({ hands: [], controllers: ['left'] });
  });
});
