/**
 * Holds the latest result per premise and fans each update out to the panel, the 2D mirror,
 * the console (one JSON line per update) and localStorage (last full board).
 */
import { makeResult, type PremiseId, type PremiseResult } from './verdict.js';

export const PREMISE_IDS: readonly PremiseId[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
export const LAST_RESULTS_KEY = 'probe.lastResults';

// Initial evidence doubles as the operator instruction for each row.
const HINTS: Record<PremiseId, string> = {
  a: 'enter XR, tap Allow, then speak for 3 s',
  b: 'starts after a',
  c: 'enter XR; show hands',
  d: 'reload once',
  e: 'enter XR; measured after b finishes',
  f: 'tap Run AR probe',
  g: 'prod build: load once, then airplane mode + reload',
};

type Listener = (results: readonly PremiseResult[]) => void;

export class ResultBoard {
  private readonly byId = new Map<PremiseId, PremiseResult>();
  private readonly listeners = new Set<Listener>();

  constructor() {
    for (const id of PREMISE_IDS) this.byId.set(id, makeResult(id, 'PENDING', HINTS[id]));
  }

  all(): PremiseResult[] {
    return PREMISE_IDS.map((id) => this.byId.get(id) as PremiseResult);
  }

  set(result: PremiseResult): void {
    const prev = this.byId.get(result.id);
    if (prev && prev.status === result.status && prev.evidence === result.evidence) return;
    this.byId.set(result.id, result);
    const all = this.all();
    console.log('[probe]', JSON.stringify(result));
    try {
      localStorage.setItem(LAST_RESULTS_KEY, JSON.stringify({ at: new Date().toISOString(), results: all }));
    } catch (err) {
      // Storage can be unavailable (private mode, quota); the board itself must keep working.
      console.warn('[probe] could not persist results', err);
    }
    for (const fn of this.listeners) fn(all);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.all());
    return () => this.listeners.delete(fn);
  }
}
