# Flashcard Defense (game-iwsdk)

WebXR flashcard game for Meta Quest, built on the Meta Immersive Web SDK (IWSDK) and
three.js. Two pages: `cards.html` (the game, `src/cards.ts`) and `index.html` (the
device-premises probe board, `src/probe/`). Asset and dependency licenses: `CREDITS.md`.

## The game (`cards.html`)

Passthrough (`immersive-ar`) session with plane detection.

- **Start screen**: Start (pick a deck) or Mastery (per-deck learning/mastered counts).
  Deck orbs are re-placed in front of the head when the XR session starts.
- **Card enemies**: a wave of cartoon-faced cards emerges from detected walls (or an even
  ring when no walls are known) and walks toward you. A run reserves up to 12 cards.
- **Reveal and answer**: slash an enemy with a hand or controller tip to reveal it, or
  select it (controller trigger, hand pinch ray, or mouse). Its question opens on a
  see-through panel with answer orbs below; slash or select the right orb. A correct
  answer flashes green, throws shards, plays a tone and pulses controller haptics.
- **Shield pips**: you start with 5; each enemy strike costs one; the run is lost at 0.
- **Ultimate**: charges after 5 correct answers; the ultimate orb glows when ready. Fire
  with a two-palm push, a controller grip squeeze, or by selecting the orb; it knocks
  enemies back.
- **Progress**: FSRS scheduling (`ts-fsrs`) per deck, saved in `localStorage`
  (`flashcards.fsrs.save`); the FSRS queue of the selected deck picks which cards spawn.
- **Decks**: three bundled starter decks (`src/flashcards/starter-decks.ts`), plus
  decks imported on the 2D page before entering XR.

### Deck import (2D page)

The panel at the top-left of `cards.html` takes pasted deck JSON or a file
(`src/import-panel.ts`); it is hidden during an XR session. Imported decks persist in
`localStorage` (`flashcards.decks`).

```json
{ "id": "my-deck", "title": "My Deck",
  "cards": [{ "id": "c1", "prompt": "Capital of Peru?", "answer": "Lima", "aliases": ["lima peru"] }] }
```

Every deck passes `parseDeck` (`src/flashcards/deck-schema.ts`): caps on size and field
length, and at least 4 distinct answers so each card can show 4 orbs. Duplicate card ids
open a resolver (pick a copy per id or keep first), applied only after an explicit
confirm, with Undo. Importing a deck whose id already exists asks to replace it, also
with Undo.

## Run on the desktop emulator

```sh
npm install
npx vite --port 8081 --strictPort
```

Open `https://localhost:8081/cards.html` and accept the self-signed certificate
(`iwsdkDev` serves HTTPS; cert cached in `.iwsdk/https/`). The `iwsdkDev` vite plugin
injects the IWER emulator on localhost, so Enter XR works without a headset.

`npm run dev` instead starts the managed IWSDK dev runtime (Runtime and Editor controls
in the managed browser). IWSDK allows one dev runtime per checkout.

## Run on a Quest

Open `https://<LAN-IP>:8081/cards.html` on the Quest and accept the certificate warning.
Fallback over USB: `adb reverse tcp:8081 tcp:8081`, then open
`https://localhost:8081/cards.html` (localhost is a secure context).

## Tests

```sh
npx vitest run tests/<file>.test.ts   # one file; `npm test` runs all unit tests
npx tsc --noEmit
npm run build
python -m pytest scripts/fsrs
```

End-to-end playthrough (about 5-8 min; headless Chromium + the IWER-emulated Quest 3,
real controller input via IWER's remote-control interface):

```sh
npm run test:e2e
```

It plays against `E2E_BASE_URL` if set, else this checkout's own live IWSDK dev runtime
(`.iwsdk/runtime/session.json`), else it spawns vite on a free port. IWSDK allows one dev
runtime per checkout, so a running `npm run dev` is reused, never duplicated.
Screenshots go to `E2E_SCREENSHOT_DIR` (default: OS temp `flashcards-e2e/`).

The pytest suite checks that `scripts/fsrs/gen_vectors.py` regenerates
`tests/fixtures/fsrs/vectors.json` byte-for-byte; the fixture is pinned to py-fsrs 6.3.2
(`scripts/fsrs/requirements.txt`). Regenerate with `python scripts/fsrs/gen_vectors.py`.

## Device-premises probe board (`index.html`)

A spike board (`src/probe/`) that checks on a real headset whether each premise
the game depends on holds. Each row shows a verdict plus evidence; every update
is also logged as a `[probe]` JSON console line and the full board is saved to
`localStorage["probe.lastResults"]`. Evidence is labelled as Quest 2 (judges
use Quest 3/3S).

| Row | Premise | PASS when |
| --- | --- | --- |
| a | Mic inside the immersive session | permission granted in-session and 3 s capture peak RMS > 0.001; PENDING while the AudioContext is not running (suspended: tap Re-run audio) |
| b | Whisper `onnx-community/whisper-tiny.en` on WebGPU | speech in the row-a clip (peak RMS >= 0.01 and a transcript with a 2+ letter word after stripping `[..]`/`(..)` tokens), then p50 of 5 timed runs (after 1 warm-up) <= 1500 ms |
| c | Input sources (controller -> hand) | any hand input seen; controllers alone stay PENDING ("show your hands") |
| d | Persistence | after a reload, localStorage boot count and IndexedDB round-trip both survive |
| e | Frame rate (FPS knee) | p5 >= 60 fps over >= 300 frames at load level 0 (evidence `L0 verdict: ...`, then per-level `L<n> p50/p5 (n=frames)`); load +/- buttons step 50 meshes (max 1000) to find the knee as evidence; metering pauses during the audio probe, the AR probe, and any passthrough session |
| f | `immersive-ar` + planes/mesh | AR session starts and detects > 0 planes or meshes in a 10 s window (`Run AR probe`); PENDING (never FAIL) if the session ends early |
| g | Offline reload under the service worker | the page boots with no network while SW-controlled |

| Verdict | Meaning |
| --- | --- |
| PASS | premise measured and meets the bar |
| FAIL | measured and misses the bar, or errored |
| UNAVAILABLE | capability absent (no getUserMedia / WebGPU / immersive-ar / serviceWorker); for b also: no mic clip from row a, no speech (silent clip, empty or non-speech transcript), or model fetch failed offline (`model not cached/offline`) |
| PENDING | not measured yet; the evidence text is the next operator step |

The in-VR `Re-run audio` button re-runs rows a and b; it works only inside an
XR session (outside it, a still-PENDING row a shows `enter XR to re-run audio`).

The probe scene keeps the IWSDK starter's studio props, built in code in
`src/scene-assets/` (no model downloads), and the `public/ui/*.uikitml` panels.

### Probe on a Quest

Use a production build; row g needs the service worker, which dev builds never
register, so g stays PENDING under `npm run dev`.

```sh
npm run build && npx vite preview --host 0.0.0.0 --port 8081
```

Open `https://<LAN-IP>:8081` (or `https://localhost:8081` after `adb reverse`, as above).
For row g: load once online, enable airplane mode, reload.

### Offline notes

- ONNX Runtime wasm is bundled same-origin (transformers.js would otherwise
  fetch it from cdn.jsdelivr.net).
- The SW precaches every `dist/` file (~31 MB); the cache name hashes file
  contents, so a rebuild with changed bytes gets a fresh cache.
- Still network-bound: controller profiles load from cdn.jsdelivr.net
  (`@iwsdk/xr-input` default), and Whisper weights download from Hugging Face on
  first run (then served from the transformers.js browser cache).

## References

- Minimal scene walkthrough: https://iwsdk.dev/guides/01b-minimal-scene.html
- IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls
