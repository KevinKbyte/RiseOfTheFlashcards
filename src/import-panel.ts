// 2D deck import panel (M11, A10) shown on cards.html before entering XR. It only renders the pure
// menu-flow state machine and forwards DOM events to it. Every deck- or user-derived string goes
// through textContent / createElement -- never innerHTML -- because imported text is untrusted.
import {
  cancelReplace,
  confirmReplace,
  dedupeCancelConfirm,
  dedupeConfirm,
  dedupeContinue,
  dedupeKeepFirst,
  dedupeRequestConfirm,
  dedupeSetChoice,
  dedupeUndo,
  dedupeView,
  MAX_IMPORT_CHARS,
  openDeckSelect,
  openImport,
  replaceView,
  setImportText,
  submitImport,
  undoReplace,
} from './flashcards/menu-flow.js';
import type { MenuState } from './flashcards/menu-flow.js';
import type { Choice } from './flashcards/deck-dedupe.js';

export interface ImportPanelOptions {
  state: MenuState;
  onChange: (state: MenuState) => void;
}

export interface ImportPanelHandle {
  getState(): MenuState;
  destroy(): void;
}

let panelSeq = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Any screen that is not mid-dialog can take new import text; this moves it to 'import'. */
function toImport(state: MenuState): MenuState {
  return state.screen === 'import' ? state : openImport(openDeckSelect(state));
}

export function mountImportPanel(root: HTMLElement, options: ImportPanelOptions): ImportPanelHandle {
  let state = options.state;
  const radioPrefix = `dupe-${++panelSeq}`;
  const container = el('div');
  root.appendChild(container);

  const update = (next: MenuState, rerender = true): void => {
    if (next === state) return;
    state = next;
    options.onChange(state);
    if (rerender) render();
  };

  const btn = (label: string, action: () => void, disabled = false): HTMLButtonElement => {
    const b = el('button', label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', action);
    return b;
  };

  const errorLine = (): HTMLElement => {
    const p = el('p', state.importError ?? '');
    p.dataset.testid = 'import-error';
    p.setAttribute('role', 'alert');
    return p;
  };

  function readFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // UTF-8 bytes >= characters, so a file over the cap in bytes is refused before it is read.
    if (file.size > MAX_IMPORT_CHARS) {
      update({ ...toImport(state), importError: `deck file is too large (over ${MAX_IMPORT_CHARS} characters)` });
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      update(submitImport(setImportText(toImport(state), text)));
    });
    reader.addEventListener('error', () => {
      update({ ...toImport(state), importError: 'could not read the deck file' });
    });
    reader.readAsText(file);
  }

  function importSection(): HTMLElement {
    const section = el('section');
    const area = el('textarea');
    area.rows = 6;
    area.placeholder = 'Paste deck JSON here';
    area.setAttribute('aria-label', 'Deck JSON');
    area.value = state.importText;
    const error = errorLine();
    // No re-render on typing: replacing the textarea would drop focus and the caret.
    area.addEventListener('input', () => {
      update(setImportText(toImport(state), area.value), false);
      error.textContent = '';
    });
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,.txt,application/json,text/plain';
    file.setAttribute('aria-label', 'Deck file');
    file.addEventListener('change', () => readFile(file));
    section.append(area, btn('Import', () => update(submitImport(toImport(state)))), file, error);
    return section;
  }

  function dedupeSection(): HTMLElement {
    const view = dedupeView(state);
    const section = el('section');
    section.append(el('h3', 'Duplicate card ids'));
    for (const group of view.groups) {
      const g = el('div');
      g.dataset.testid = 'dupe-group';
      g.append(el('h4', `Card id: ${group.id}`));
      for (const copy of group.copies) {
        const row = el('div');
        row.dataset.testid = 'dupe-copy';
        row.append(el('span', `${copy.prompt} -> ${copy.answer} `));
        for (const choice of ['keep', 'drop'] as Choice[]) {
          const label = el('label');
          const radio = el('input');
          radio.type = 'radio';
          radio.name = `${radioPrefix}-${copy.index}`;
          radio.value = choice;
          radio.checked = copy.choice === choice;
          radio.disabled = view.phase !== 'selecting';
          radio.addEventListener('change', () => update(dedupeSetChoice(state, copy.index, choice)));
          label.append(radio, document.createTextNode(` ${choice} `));
          row.append(label);
        }
        g.append(row);
      }
      section.append(g);
    }
    if (view.phase === 'selecting') {
      section.append(
        btn('Keep first', () => update(dedupeKeepFirst(state))),
        btn('Apply', () => update(dedupeRequestConfirm(state)), !view.canApply),
      );
      if (view.applyBlockReason) section.append(el('p', view.applyBlockReason));
    } else if (view.phase === 'confirming') {
      const confirm = el('p', `Drop ${view.dropCount} duplicate card(s)?`);
      confirm.dataset.testid = 'dedupe-confirm';
      section.append(
        confirm,
        btn('Confirm', () => update(dedupeConfirm(state))),
        btn('Cancel', () => update(dedupeCancelConfirm(state))),
      );
    } else {
      section.append(
        el('p', 'Duplicates dropped.'),
        btn('Undo', () => update(dedupeUndo(state))),
        btn('Continue', () => update(dedupeContinue(state))),
      );
    }
    return section;
  }

  function replaceSection(): HTMLElement {
    const view = replaceView(state);
    const section = el('section');
    const ask = el('p', view ? `Replace existing deck "${view.existingTitle}" with "${view.newTitle}"?` : '');
    ask.dataset.testid = 'replace-confirm';
    section.append(
      ask,
      btn('Replace', () => update(confirmReplace(state))),
      btn('Cancel', () => update(cancelReplace(state))),
    );
    return section;
  }

  function deckList(): HTMLElement {
    const section = el('section');
    section.append(el('h3', 'Decks'));
    const list = el('ul');
    list.dataset.testid = 'deck-list';
    for (const deck of state.decks) list.append(el('li', `${deck.title} (${deck.cards.length} cards)`));
    section.append(list);
    if (state.screen === 'ready' && state.selectedDeck) {
      section.append(el('p', `Imported: ${state.selectedDeck.title}. Enter XR to play it.`));
      if (state.replaceUndo) section.append(btn('Undo', () => update(undoReplace(state))));
    }
    return section;
  }

  function render(): void {
    const body =
      state.screen === 'dedupe' ? dedupeSection() : state.screen === 'confirm-replace' ? replaceSection() : importSection();
    container.replaceChildren(el('h2', 'Import a deck'), body, deckList());
  }

  render();
  return {
    getState: () => state,
    destroy: () => container.remove(),
  };
}
