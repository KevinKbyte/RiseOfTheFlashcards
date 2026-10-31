# Rise of the Flashcards

Seated mixed-reality flashcard combat for Meta Quest 3/3S. Humanity abandoned its flashcards, deciding they were boring and
procrastinating on them all the time, so now the flashcards are on a rampage. Card-enemies emerge from your real walls (scene
understanding); you slash a card with your hand, then say the answer aloud. Correct answers deal damage, bigger enemies carry multi-card
health pools, and you dodge their attacks by leaning or ducking. Silent mode swaps voice for slashable answer orbs. Spaced repetition
decides which cards come back.

- Status: pre-alpha. Entry for Meta VR Start Developer Competition 2026 (Gaming track).
- Engine: Unreal Engine 5.8 (this repo; 5.7.4 fallback only). A parallel IWSDK (WebXR) build lives in the sibling repo `../game-iwsdk` (plan D1).
- Input: hands or controllers. Seated, small play space.
- Decks: bundled starter decks, or paste your own on a companion web page and pair it to the headset with a short code.
- Build plan: `docs/plans/2026-10-28-vr-flashcard-game.md`.

## Repo layout

| Path | Contents |
|---|---|
| `relay/` | Pairing relay serverless function (companion page -> headset deck hand-off) and its tests |
| `scripts/` | Repo tooling (credits audit) and its tests |
| `docs/` | Plan, ADRs, privacy policy, Devpost draft |
| `tests/fixtures/` | Shared test fixtures, incl. `normalize.json` (answer-normalization contract for every implementation) |

## Builds

| Build | Where | How judges get it |
|---|---|---|
| Unreal (Quest APK) | this repo | Meta dashboard release channel "Competition" + invite URL |
| IWSDK (WebXR) | `../game-iwsdk` (separate repo) | hosted URL (link TBD) |

Preferred build for judges: decided at the end of the IWSDK device spike (plan D1).

## Common Commands

```bash
node --test                           # all relay + script tests, from repo root
node scripts/credits-audit.mjs        # exit 1 lists any asset file missing from CREDITS.md
```

## Docs

- `CREDITS.md`: asset and dependency credits (audited).
- `docs/privacy-policy.md`: what the game and relay collect and how long it is kept.
- `docs/adr/0003-provenance.md`: when the concept started and what is new vs the author's earlier 2D game.

## License and credits

MIT (`LICENSE`). Made by Kev ([KevinKbyte](https://github.com/KevinKbyte)).
