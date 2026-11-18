/**
 * @vitest-environment jsdom
 */
// Requirement: before entering XR, the cards.html page offers a 2D HTML deck import panel so a
// user can actually paste or load a deck. mountImportPanel(root, { state, onChange }) renders into
// the given root element and drives the pure menu-flow import functions: a textarea + Import
// button submits pasted text; a file input (accepting .json and .txt) feeds the file's text through
// the same submit path; over-cap text (> MAX_IMPORT_CHARS) is refused with a "too large" message
// and no deck is added. A successful import lists the deck by title. Every user-supplied or error
// string is rendered as text (textContent), never HTML. onChange receives each new MenuState.
// Covers: M11, A10
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountImportPanel } from '../src/import-panel.js';
import type { ImportPanelHandle } from '../src/import-panel.js';
import {
  createMenu,
  MAX_IMPORT_CHARS,
  openDeckSelect,
  openImport,
} from '../src/flashcards/menu-flow.js';
import type { MenuState } from '../src/flashcards/menu-flow.js';
import type { DeckCard } from '../src/flashcards/deck-schema.js';
import { STARTER_DECKS } from '../src/flashcards/starter-decks.js';

const XSS = '<img src=x onerror=alert(1)>';

function c(id: string, n: number): DeckCard {
  return { id, prompt: `Prompt ${n}?`, answer: `Answer ${n}` };
}

function deckJson(id: string, title: string, cards?: DeckCard[]): string {
  return JSON.stringify({ id, title, cards: cards ?? [c('w', 10), c('x', 11), c('y', 12), c('z', 13)] });
}

function importState(): MenuState {
  return openImport(openDeckSelect(createMenu()));
}

interface Mounted {
  root: HTMLElement;
  handle: ImportPanelHandle;
  onChange: ReturnType<typeof vi.fn>;
  last: () => MenuState;
}

const roots: HTMLElement[] = [];

function mount(state: MenuState = importState()): Mounted {
  const root = document.createElement('div');
  document.body.appendChild(root);
  roots.push(root);
  const onChange = vi.fn();
  const handle = mountImportPanel(root, { state, onChange });
  const last = (): MenuState => {
    const calls = onChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as MenuState;
  };
  return { root, handle, onChange, last };
}

afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

function button(root: HTMLElement, label: RegExp): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => label.test((b.textContent ?? '').trim()));
  if (!found) throw new Error(`no button matching ${label}; buttons: ${[...root.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found;
}

function hasButton(root: HTMLElement, label: RegExp): boolean {
  return [...root.querySelectorAll('button')].some((b) => label.test((b.textContent ?? '').trim()));
}

function byTestId(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no [data-testid="${id}"]`);
  return el;
}

function paste(root: HTMLElement, text: string): void {
  const area = root.querySelector('textarea');
  if (!area) throw new Error('no textarea');
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function pasteAndImport(root: HTMLElement, text: string): void {
  paste(root, text);
  button(root, /^import$/i).click();
}

function chooseFile(root: HTMLElement, name: string, text: string): void {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  const file = new File([text], name, { type: name.endsWith('.json') ? 'application/json' : 'text/plain' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function deckListText(root: HTMLElement): string[] {
  return [...byTestId(root, 'deck-list').querySelectorAll('li')].map((li) => li.textContent ?? '');
}

// Covers: M11, A10
describe('import panel: paste and file import', () => {
  it('returns a handle and renders a textarea, an Import button and a .json/.txt file input', () => {
    const { root, handle } = mount();
    expect(handle).toBeTruthy();
    expect(root.querySelector('textarea')).not.toBeNull();
    expect(hasButton(root, /^import$/i)).toBe(true);
    const file = root.querySelector<HTMLInputElement>('input[type="file"]');
    expect(file).not.toBeNull();
    expect(file?.accept).toMatch(/\.json/);
    expect(file?.accept).toMatch(/\.txt/);
  });

  it('pasted deck text + Import submits it and lists the imported deck by title', () => {
    const { root, last } = mount();
    pasteAndImport(root, deckJson('mine', 'My Deck'));
    expect(last().screen).toBe('ready');
    expect(last().selectedDeck?.id).toBe('mine');
    expect(deckListText(root).some((t) => t.includes('My Deck'))).toBe(true);
  });

  it('a chosen .json file goes through the same import path', async () => {
    const { root, last } = mount();
    chooseFile(root, 'deck.json', deckJson('filed', 'File Deck'));
    await vi.waitFor(() => expect(last().selectedDeck?.id).toBe('filed'));
    expect(deckListText(root).some((t) => t.includes('File Deck'))).toBe(true);
  });

  it('a chosen .txt file goes through the same import path', async () => {
    const { root, last } = mount();
    chooseFile(root, 'deck.txt', deckJson('texty', 'Text Deck'));
    await vi.waitFor(() => expect(last().selectedDeck?.id).toBe('texty'));
    expect(deckListText(root).some((t) => t.includes('Text Deck'))).toBe(true);
  });

  it('refuses a file over the import cap with a too-large message and adds no deck', async () => {
    const { root, onChange } = mount();
    const over = deckJson('big', 'Big Deck') + ' '.repeat(MAX_IMPORT_CHARS);
    chooseFile(root, 'big.json', over);
    await vi.waitFor(() => expect(byTestId(root, 'import-error').textContent).toMatch(/too large/i));
    for (const [s] of onChange.mock.calls as [MenuState][]) {
      expect(s.decks.some((d) => d.id === 'big')).toBe(false);
    }
  });

  it('refuses pasted text over the import cap with a too-large message', () => {
    const { root, last } = mount();
    pasteAndImport(root, 'x'.repeat(MAX_IMPORT_CHARS + 1));
    expect(last().screen).toBe('import');
    expect(byTestId(root, 'import-error').textContent).toMatch(/too large/i);
  });
});

// Requirement: import error messages and imported text are rendered as literal text via
// textContent, never as HTML -- a hostile payload such as <img src=x onerror=alert(1)> in pasted
// text, a deck title, or a duplicate card's prompt appears verbatim and creates no element.
// Covers: M11, A10
describe('import panel: text-only rendering', () => {
  it('shows the parse error for invalid pasted text without creating any element from it', () => {
    const { root } = mount();
    pasteAndImport(root, XSS);
    expect(byTestId(root, 'import-error').textContent).toMatch(/not valid JSON/i);
    expect(root.querySelector('img')).toBeNull();
  });

  it('shows a schema error message from parseDeck as text', () => {
    const { root } = mount();
    pasteAndImport(root, JSON.stringify({ id: 'x', title: 't', cards: [] }));
    expect(byTestId(root, 'import-error').textContent).toMatch(/at least one card/i);
  });

  it('renders a hostile deck title as literal text in the deck list', () => {
    const { root } = mount();
    pasteAndImport(root, deckJson('evil', XSS));
    expect(deckListText(root).some((t) => t.includes(XSS))).toBe(true);
    expect(root.querySelector('img')).toBeNull();
  });

  it('renders a hostile duplicate-card prompt as literal text', () => {
    const { root } = mount();
    const evil: DeckCard = { id: 'a', prompt: XSS, answer: 'Answer 0' };
    pasteAndImport(root, deckJson('d', 'Dupes', [evil, c('a', 1), c('b', 2), c('c', 3), c('d', 4)]));
    expect(root.textContent).toContain(XSS);
    expect(root.querySelector('img')).toBeNull();
  });
});

// Requirement: a pasted deck with duplicate card ids opens a dedupe view listing each duplicate
// group with a keep/drop choice per copy plus a bulk "keep first" action. Applying is a two-step
// action -- the first click only opens a confirm step that states how many cards will be dropped
// (no single click deletes); Cancel backs out with nothing dropped; Confirm drops them and then
// offers an Undo that restores every duplicate group and choice.
// Covers: M11
describe('import panel: duplicate resolution', () => {
  // ids a,a,b,c,c,d -> two groups; keep-first drops 2 and keeps 4 distinct answers.
  const DUPES = deckJson('dup', 'Dup Deck', [c('a', 1), c('a', 2), c('b', 3), c('c', 4), c('c', 5), c('d', 6)]);

  function groups(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('[data-testid="dupe-group"]')];
  }

  function copies(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-testid="dupe-copy"]')];
  }

  function radio(copy: HTMLElement, choice: 'keep' | 'drop'): HTMLInputElement {
    const el = copy.querySelector<HTMLInputElement>(`input[type="radio"][value="${choice}"]`);
    if (!el) throw new Error(`no ${choice} radio`);
    return el;
  }

  it('lists each duplicate group with keep and drop controls on every copy', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    expect(last().screen).toBe('dedupe');
    const gs = groups(root);
    expect(gs).toHaveLength(2);
    for (const g of gs) {
      expect(copies(g)).toHaveLength(2);
      for (const copy of copies(g)) {
        radio(copy, 'keep');
        radio(copy, 'drop');
      }
    }
    expect(root.textContent).toContain('Prompt 1?');
    expect(root.textContent).toContain('Prompt 2?');
  });

  it('a per-copy keep/drop choice updates the menu state', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    radio(copies(groups(root)[0])[1], 'drop').click();
    expect(last().resolver?.choices[1]).toBe('drop');
  });

  it('bulk keep-first, then Apply opens a confirm step stating the drop count without dropping', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    button(root, /keep first/i).click();
    button(root, /^apply/i).click();
    expect(last().resolver?.phase).toBe('confirming');
    expect(last().resolver?.deck.cards).toHaveLength(6);
    expect(byTestId(root, 'dedupe-confirm').textContent).toMatch(/\b2\b/);
  });

  it('Cancel on the confirm step drops nothing and returns to choosing', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    button(root, /keep first/i).click();
    button(root, /^apply/i).click();
    button(root, /^cancel/i).click();
    expect(last().resolver?.phase).toBe('selecting');
    expect(last().resolver?.deck.cards).toHaveLength(6);
    expect(groups(root)).toHaveLength(2);
  });

  it('Confirm drops the copies, then Undo restores the groups and choices', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    button(root, /keep first/i).click();
    button(root, /^apply/i).click();
    button(root, /^confirm/i).click();
    expect(last().resolver?.phase).toBe('applied');
    expect(last().resolver?.deck.cards).toHaveLength(4);
    expect(groups(root)).toHaveLength(0);
    button(root, /^undo/i).click();
    expect(last().resolver?.phase).toBe('selecting');
    expect(last().resolver?.deck.cards).toHaveLength(6);
    const gs = groups(root);
    expect(gs).toHaveLength(2);
    expect(radio(copies(gs[0])[0], 'keep').checked).toBe(true);
    expect(radio(copies(gs[0])[1], 'drop').checked).toBe(true);
  });

  it('Continue after applying imports the deduped deck and lists it', () => {
    const { root, last } = mount();
    pasteAndImport(root, DUPES);
    button(root, /keep first/i).click();
    button(root, /^apply/i).click();
    button(root, /^confirm/i).click();
    button(root, /^continue/i).click();
    expect(last().selectedDeck?.id).toBe('dup');
    expect(last().selectedDeck?.cards).toHaveLength(4);
    expect(deckListText(root).some((t) => t.includes('Dup Deck'))).toBe(true);
  });
});

// Requirement: importing a deck whose id matches an existing deck never silently replaces it; the
// panel asks to replace (naming the existing deck) with Replace and Cancel. Cancel leaves the deck
// list unchanged; Replace swaps the deck in and then offers an Undo that restores the original.
// Covers: M11, A10
describe('import panel: replace existing deck', () => {
  const existing = STARTER_DECKS[0];
  const CLASH = deckJson(existing.id, 'Brand New Title');

  it('asks to replace, naming the existing deck, instead of replacing silently', () => {
    const { root, last } = mount();
    pasteAndImport(root, CLASH);
    expect(last().screen).toBe('confirm-replace');
    expect(byTestId(root, 'replace-confirm').textContent).toContain(existing.title);
    expect(hasButton(root, /^replace/i)).toBe(true);
    expect(hasButton(root, /^cancel/i)).toBe(true);
  });

  it('Cancel keeps the existing deck unchanged', () => {
    const { root, last } = mount();
    pasteAndImport(root, CLASH);
    button(root, /^cancel/i).click();
    expect(last().screen).toBe('import');
    expect(last().decks).toEqual(STARTER_DECKS);
  });

  it('Replace swaps the deck in, then Undo restores the original', () => {
    const { root, last } = mount();
    pasteAndImport(root, CLASH);
    button(root, /^replace/i).click();
    expect(last().decks.find((d) => d.id === existing.id)?.title).toBe('Brand New Title');
    expect(deckListText(root).some((t) => t.includes('Brand New Title'))).toBe(true);
    button(root, /^undo/i).click();
    expect(last().decks).toEqual(STARTER_DECKS);
    expect(root.textContent).not.toContain('Brand New Title');
  });
});

// Requirement: after an import or a replace lands (screen 'ready'), editing the textarea must
// never leave a dead Undo on screen -- any Undo control still visible must actually restore the
// replaced deck, otherwise no Undo is shown. The success line names the imported deck and tells
// the user to pick it from the deck menu in VR; it does not claim "Enter XR to play it" as if the
// deck were preselected in XR.
// Covers: M11, A10
describe('import panel: ready screen after import', () => {
  const existing = STARTER_DECKS[0];
  const CLASH = deckJson(existing.id, 'Brand New Title');

  it('typing after a replace leaves no visible Undo that does nothing', () => {
    const { root, last } = mount();
    pasteAndImport(root, CLASH);
    button(root, /^replace/i).click();
    expect(hasButton(root, /^undo/i)).toBe(true);
    paste(root, 'still typing');
    if (hasButton(root, /^undo/i)) {
      button(root, /^undo/i).click();
      expect(last().decks).toEqual(STARTER_DECKS);
    }
  });

  it('typing after a plain import leaves no visible Undo that does nothing', () => {
    const { root, last } = mount();
    pasteAndImport(root, deckJson('mine', 'My Deck'));
    paste(root, 'more');
    if (hasButton(root, /^undo/i)) {
      const before = last();
      button(root, /^undo/i).click();
      expect(last()).not.toBe(before);
    }
  });

  it('success text names the deck and says to pick it from the menu in VR', () => {
    const { root } = mount();
    pasteAndImport(root, deckJson('mine', 'My Deck'));
    expect(root.textContent).not.toContain('Enter XR to play it');
    const line = [...root.querySelectorAll('p')].map((p) => p.textContent ?? '').find((t) => t.includes('My Deck'));
    expect(line, 'a paragraph mentioning the imported deck title').toBeDefined();
    expect(line).toMatch(/\b(pick|choose|select)\b/i);
    expect(line).toMatch(/menu/i);
    expect(line).toMatch(/\b(VR|XR)\b/);
  });
});

// Requirement: while the user is in XR the 2D import panel must not be interactive behind the
// headset session -- handle.setHidden(true) hides the panel (root or its panel container is hidden
// or inert) and disables every control; setHidden(false) shows it again with controls enabled.
// Covers: M11, A10
describe('import panel: hide during XR', () => {
  function controls(root: HTMLElement): (HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement)[] {
    return [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button, input, textarea')];
  }

  function concealed(root: HTMLElement): boolean {
    const panel = root.firstElementChild as HTMLElement | null;
    return [root, panel].some((n) => !!n && (n.hidden || n.hasAttribute('inert')));
  }

  it('setHidden(true) hides the panel and disables all controls', () => {
    const { root, handle } = mount();
    handle.setHidden(true);
    expect(concealed(root)).toBe(true);
    const cs = controls(root);
    expect(cs.length).toBeGreaterThan(0);
    for (const ctl of cs) expect(ctl.disabled).toBe(true);
  });

  it('setHidden(false) shows the panel again with controls enabled', () => {
    const { root, handle } = mount();
    handle.setHidden(true);
    handle.setHidden(false);
    expect(concealed(root)).toBe(false);
    for (const ctl of controls(root)) expect(ctl.disabled).toBe(false);
    pasteAndImport(root, deckJson('mine', 'My Deck'));
    expect(deckListText(root).some((t) => t.includes('My Deck'))).toBe(true);
  });
});

// Requirement: the import panel shows users an example deck they can follow to write their own
// (user ask, 2026-11-18: "shouldn't the deck json have some sort of example that the user can follow
// so they know how to make cards for import"). src/import-panel.ts exports EXAMPLE_DECK_JSON, the
// pretty-printed JSON of a small valid deck (id, title, cards with id/prompt/answer; at least 4
// cards with 4 distinct non-numeric answers; at least one card shows the optional aliases array)
// whose id clashes with no starter deck. The import section renders it as text in a <pre>
// (data-testid="import-example"). A "Load example" button puts it into the textarea and the
// MenuState importText without importing; Import then adds the example deck to the deck list.
// Covers: M11, A10
describe('import panel: example deck to follow', () => {
  async function example(): Promise<string> {
    const mod = (await import('../src/import-panel.js')) as unknown as Record<string, unknown>;
    const json = mod.EXAMPLE_DECK_JSON;
    if (typeof json !== 'string') throw new Error('import-panel does not export EXAMPLE_DECK_JSON: string');
    return json;
  }

  it('EXAMPLE_DECK_JSON is pretty-printed JSON of a deck parseDeck accepts', async () => {
    const { parseDeck } = await import('../src/flashcards/deck-schema.js');
    const json = await example();
    expect(json).toContain('\n');
    const parsed = JSON.parse(json) as { id: string; title: string; cards: DeckCard[] };
    expect(JSON.stringify(parsed, null, 2)).toBe(json.trim());
    expect(parseDeck(parsed).ok).toBe(true);
    expect(parsed.cards.length).toBeGreaterThanOrEqual(4);
    for (const card of parsed.cards) {
      expect(typeof card.id).toBe('string');
      expect(typeof card.prompt).toBe('string');
      expect(typeof card.answer).toBe('string');
    }
    const answers = new Set(parsed.cards.map((card) => card.answer.trim().toLowerCase()));
    expect(answers.size).toBeGreaterThanOrEqual(4);
    for (const a of answers) expect(a).not.toMatch(/^[+-]?[\d.,]+$/);
    expect(parsed.cards.some((card) => Array.isArray(card.aliases) && card.aliases.length > 0)).toBe(true);
  });

  it('the example deck id does not collide with any starter deck id', async () => {
    const parsed = JSON.parse(await example()) as { id: string };
    expect(STARTER_DECKS.map((d) => d.id)).not.toContain(parsed.id);
  });

  it('renders the example as text in a <pre> with data-testid="import-example"', async () => {
    const json = await example();
    const { root } = mount();
    const shown = byTestId(root, 'import-example');
    expect(shown.tagName).toBe('PRE');
    expect(shown.textContent).toBe(json);
  });

  it('"Load example" fills the textarea and importText without importing', async () => {
    const json = await example();
    const { root, last } = mount();
    const before = importState().decks.length;
    button(root, /^Load example$/).click();
    const area = root.querySelector('textarea');
    expect(area?.value).toBe(json);
    expect(last().importText).toBe(json);
    expect(last().screen).toBe('import');
    expect(last().decks).toHaveLength(before);
  });

  it('Import after "Load example" adds the example deck to the deck list', async () => {
    const parsed = JSON.parse(await example()) as { id: string; title: string };
    const { root, last } = mount();
    button(root, /^Load example$/).click();
    button(root, /^import$/i).click();
    expect(last().decks.some((d) => d.id === parsed.id)).toBe(true);
    expect(deckListText(root).some((t) => t.includes(parsed.title))).toBe(true);
  });
});
