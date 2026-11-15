# Rise of the Flashcards

**Play:** open https://kevinkbyte.github.io/RiseOfTheFlashcards/cards.html in the Meta Quest 3/3S browser and enter the session.

Seated mixed-reality flashcard combat for Meta Quest 3/3S. Humanity abandoned its flashcards, deciding they were boring and
procrastinating on them all the time, so now the flashcards are on a rampage. Card-enemies emerge from your real walls (scene
understanding); you slash a card with your hand, then say the answer aloud. Correct answers deal damage, bigger enemies carry multi-card
health pools, and you dodge their attacks by leaning or ducking. Silent mode swaps voice for slashable answer orbs. Spaced repetition
decides which cards come back.

- Status: pre-alpha. Entry for Meta VR Start Developer Competition 2026 (Gaming track). The play link above is not live until the
  GitHub Pages deploy (prebuilt `gh-pages` branch) is done.
- Engine: WebXR, built with Meta's Immersive Web SDK (IWSDK) on three.js; source in `webxr/` (this repo).
- Input: hands only, no controller needed; controllers are an optional stretch (plan SX). Seated, small play space.
- Decks: bundled starter decks, or paste your own on a companion web page and pair it to the headset with a short code.
- Build plan: `docs/plans/2026-10-28-vr-flashcard-game.md`.

## Repo layout

| Path | Contents |
|---|---|
| `webxr/` | The WebXR game source (Meta IWSDK). Build: `npm install` then `npm run build` inside `webxr/`. Do not edit here directly: synced from the game source repo by git subtree |
| `relay/` | Pairing relay serverless function (companion page -> headset deck hand-off) and its tests |
| `scripts/` | Repo tooling (credits audit, versionCode counter) and its tests |
| `docs/` | Plan, ADRs, privacy policy, Devpost draft |
| `tests/fixtures/` | Shared test fixtures, incl. `normalize.json` (answer-normalization contract for every implementation) and `matcher-golden.json` (answer-matcher golden cases) |

## Builds

| Build | Where | How judges get it |
|---|---|---|
| IWSDK (WebXR) | `webxr/` | GitHub Pages: https://kevinkbyte.github.io/RiseOfTheFlashcards/cards.html |

## Common Commands

```bash
node --test tests/*.test.mjs          # script tests, from repo root
node --test relay/tests/*.test.mjs    # relay tests (explicit paths: a bare `node --test` on Node >= 22.18 also picks up webxr/)
node scripts/credits-audit.mjs        # exit 1 lists any asset file missing from CREDITS.md
node scripts/version-code.mjs next --state <file> [--ini <DefaultEngine.ini>]   # bump versionCode, print it, optionally set StoreVersion
```

## Docs

- `CREDITS.md`: asset and dependency credits (audited); the WebXR game's own credits are in `webxr/CREDITS.md`.
- `docs/privacy-policy.md`: what the game and relay collect and how long it is kept.
- `docs/adr/0003-provenance.md`: when the concept started and what is new vs the author's earlier 2D game.

## License and credits

MIT (`LICENSE`). Made by Kev ([KevinKbyte](https://github.com/KevinKbyte)).
