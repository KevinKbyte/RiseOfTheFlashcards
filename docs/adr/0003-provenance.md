# ADR 0003: Provenance and division claim

- Status: Accepted 2026-10-28 (G0a: New Experience claim kept with this disclosure; Devpost division field set at S13, editable until
  2026-11-18 12:00 PT, guidelines.md:101)
- Date: 2026-10-28
- Plan refs: D11, M5, M16, G0a, S13

## Context

The entry claims the New Experience division: "conceived of and built within the competition window (starting September 24, 2026). No
pre-existing codebases" (rules.md:91). The Sponsor may re-assign any entry's division at any time (rules.md:90). An Adapted entry must
include "a summary description of the new features/capabilities added" (rules.md:142), 1-2 paragraphs (guidelines.md:40).

The author built an earlier, unrelated-codebase game with a related theme: realm-of-recall, a turn-based 2D recall RPG (Unity),
developed 2026-02-10 to 2026-02-28 (first and last commit dates in its git log), before the window opened.

## Decision

1. Conception date: 2026-10-27 (VR concept session). All code and assets of this game are created on or after that date.
2. No realm-of-recall code or assets are reused (plan "Out of scope" and Rejected alternatives).
3. Devpost discloses realm-of-recall plainly and carries the paragraph below, which also serves as the Adapted summary if the division is
   re-assigned.

### New vs prior

Cites in the realm-of-recall column are files in that repo; rules.md / guidelines.md are the competition sources.

| Aspect | realm-of-recall (Feb 2026) | This game | New? |
|---|---|---|---|
| Recall drives combat; flashcard decks | Yes (README.md:3) | Yes | Shared concept |
| Spaced repetition | Yes (README.md:3) | Leitner boxes (plan D5) | Shared concept |
| Multiple-choice fallback | Button selection (SPECIFICATION.md:127) | Slashable answer orbs (silent mode) | Shared concept, new input |
| Platform | 2D, flat screen | Mixed reality on Meta Quest 3/3S, hands only | New |
| Attack input | Answer a card in a turn-based menu (SPECIFICATION.md:33-34) | Slash the card-enemy with your hand | New: VR hand-slash |
| Answer input | Text input, reveal + self-grade, buttons (SPECIFICATION.md:124-127) | Spoken answer, deterministic matcher | New: voice answers |
| Enemy placement | Random encounters on a 2D map | Enemies emerge from the player's real walls via scene understanding | New: MR wall spawns |
| Defense | Answer defense cards (SPECIFICATION.md:33) | Lean or duck to dodge attacks in real time | New: real-time dodge |
| Enemy health | HP bar + damage formula (SPECIFICATION.md:50-53, 531) | Multi-card pool: one correct answer strips one card | Shared concept (enemy HP), new: multi-card pool |

### Devpost paragraph (also the Adapted "summary of new features", rules.md:142)

> This game was conceived on October 27, 2026 and built from scratch during the competition window. It shares a theme with my earlier
> 2D prototype, realm-of-recall (February 2026, a turn-based flashcard RPG): recall as combat, spaced repetition, multiple-choice
> answers and enemy hit points all come from there. No code or assets carry over. New in this game: you
> attack by slashing card-enemies with your bare hands; you answer by saying the answer out loud (or slashing answer orbs in silent mode);
> enemies emerge from the walls of your real room using scene understanding; you dodge their attacks in real time by leaning or ducking;
> and bigger enemies carry multi-card health pools, so each correct answer strips one card.

## Consequences

- If the Sponsor re-assigns the entry to Adapted, the required summary already exists and the realm-of-recall disclosure is on record.
- New-vs-prior items mirror the Sponsor's own examples of significant updates: hand interactions and an MR interaction mode
  (rules.md:94, 96).
- Any reuse of realm-of-recall material would break the New Experience claim; keep it out (plan M16 applies the same rule to MemriPal).
