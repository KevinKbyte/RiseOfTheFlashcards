# <TITLE>

Seated mixed-reality flashcard combat for Meta Quest 3/3S. Card-enemies emerge from your real walls (scene understanding); you slash a
card with your hand, then say the answer aloud. Correct answers deal damage, bigger enemies carry multi-card health pools, and you dodge
their attacks by leaning or ducking. Silent mode swaps voice for slashable answer orbs. Spaced repetition decides which cards come back.

- Status: pre-alpha. Entry for Meta VR Start Developer Competition 2026 (Gaming track).
- Engine: per ADR 0001, pending.
- Input: hands only, no controllers. Seated, small play space.
- Decks: bundled starter decks, or paste your own on a companion web page and pair it to the headset with a short code.
- Build plan: `docs/plans/2026-10-28-vr-flashcard-game.md`.

## Repo layout

| Path | Contents |
|---|---|
| `relay/` | Pairing relay serverless function (companion page -> headset deck hand-off) and its tests |
| `scripts/` | Repo tooling (credits audit) and its tests |
| `docs/` | Plan, ADRs, privacy policy, Devpost draft |
| `tests/fixtures/` | Shared test fixtures, incl. `normalize.json` (answer-normalization contract for every implementation) |

## Common Commands

```bash
node --test relay/test scripts/test   # relay + script tests, from repo root
node scripts/credits-audit.mjs        # exit 1 lists any asset file missing from CREDITS.md
```

## Docs

- `CREDITS.md`: asset and dependency credits (audited).
- `docs/privacy-policy.md`: what the game and relay collect and how long it is kept.
- `docs/adr/0003-provenance.md`: when the concept started and what is new vs the author's earlier 2D game.

## License and credits

MIT (`LICENSE`). Made by Kev ([KevinKbyte](https://github.com/KevinKbyte)).
