# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Plan/spec (Kev 2026-11-12, stun cue and reach): a stunned enemy lunges (short ease, 0.3 s build default) from the 2 m push-back
  to the 0.7 m hold line so a hand slash reaches it; its glow switches to a distinct stun colour, its answer orbs are removed and
  the panel reads "SLASH IT" (D23 (h), (i), ENC-006, CARDS-004, CARDS-012).
- Plan/spec (Kev 2026-11-12, after an adversary review): one enemy at a time in the centre slot, the next walks in after it falls
  (no target choice); stacks of 3 cards, boss 5; the top card shows by itself at the hold line; a correct answer stuns the enemy
  and any slash then knocks a card off; FSRS still written at the answer; lives shown as `Cards r/t` plus drawn cards. Build
  defaults pending the headset check: reveal push-back to 2 m, answer window stays open after a miss, shatter/peel and win screen
  on the finishing slash, one wave = one stack (D23, ENC-001, ENC-002, ENC-006, CARDS-010, CARDS-012).
- Plan/spec (Kev 2026-11-11, after an adversary review): hold-line calibration range 0.67-0.8 m (was ~0.6-0.8, Kev to confirm),
  default 0.7 m; enemy glow frame padding `HALO_PAD` 0.10 m (was 0.18); ultimate orb moves beyond the hold line to ~(0.42, -0.34,
  -0.94) m from the eye, just right of the question panel, off the lap-rest pointing line to the right-side enemy (D22, ENC-002,
  ENC-003).
- Plan/spec (Kev 2026-11-11, panel numbers from game-iwsdk `panel-layout.ts`): question panel 20 deg below eye line (was ~15);
  fan-slot enemy faces 0.25 m above eye height (was 0.15 in code); answer orbs 0.35 m down / 0.42 m forward, 0.16 m apart
  (ENC-003, D13a).
- Plan/spec (Kev 2026-11-11, "Strike from 0.7 m"): a revealed enemy strikes from its fan slot on the 0.7 m hold line and never
  leaves it; creep speed (2.0 - 0.7) m / 8 s = 0.1625 m/s (was 0.1875 to a 0.5 m strike slot); per-player calibration moves
  to the hold line, ~0.6-0.8 m, range for Kev to confirm (D21, ENC-002, ENC-004).
- Plan/spec (Kev 2026-11-11, "Fixed fan"): arrived enemies park in three fixed slots at -35 / 0 / +35 deg on a 0.7 m hold
  line anchored at the first arrival, not at their spawn bearing on the ~0.6 m reach line, so 0.40 m enemy faces no longer
  merge over the question panel (D21, ENC-001, CARDS-010); strike slot vs hold line left as an open question for Kev.
- Docs (Kev 2026-11-14): `docs/devpost-draft.md` team name and repo link filled (Rise of the Flashcards, repo URL).
- Docs: `docs/devpost-draft.md` and `docs/privacy-policy.md` now match the shipped IWSDK WebXR build (silent orb slash,
  localStorage-only data, no mic/relay/Claude/dodge); the old voice, relay, Claude grading and dodge commitments moved to an
  "If voice / relay grading is enabled later" section in each; owner-only facts marked `TBD (Kev)`.
- Plan/spec (Kev 2026-11-07): dodge descoped (M3, D7, ENC-005); strikes always hit unless the card is answered;
  D7 upward-dodge question closed.
- Plan (Kev 2026-11-07, ledgers H-2): hands sufficient, controllers allowed (M1, M6); controller slash promoted from SX to S3b
  (one classifier, fingertip + controller tip); orb trigger select = accessibility fallback (M12 kept); ultimate = two-palm push,
  grip squeeze, or glowing ultimate orb, with a ready-glow cue (D7, S7, D17).

### Added

- WebXR game source (former `game-iwsdk` repo, main `f8e7c34`) imported with full history under `webxr/` via git subtree; README
  now leads with the GitHub Pages play link (`cards.html`), documents `webxr/`, and runs root tests by explicit path.
- MATCH-001..004: deterministic answer matcher (`relay/lib/matcher.mjs`) with 62 golden cases (`tests/fixtures/matcher-golden.json`);
  early start approved by Kev 2026-10-31.
- Matcher round-2 fixes: MATCH-002 margin tolerance, MATCH-003 hedge guard checks aliases, MATCH-005 input limits.
- Plan/spec (Kev 2026-10-31): Claude load-time aliases + toggleable upgrade-only live grading (D3a, GRADE-001..008, RELAY-013/014).
- Plan/spec (Kev 2026-10-31): slash at reach line, semi-transparent pop-out card panel, enemy creeps back (D13, D13a, ENC-001..006).
- Plan/spec (Kev 2026-10-31): reveal at any distance, fixed-speed creep, cartoon enemy faces (D13, D13a, ENC-001..007; ledgers EN-2).
- Plan/spec (Kev 2026-10-31): multi-enemy wave + choose target, wall spawn picker with ring fallback, correct-answer sound + haptic
  feedback (D8, D13, CARDS-010..012; ledgers EN-3). Plan D14-D17 moved to `docs/plans/2026-10-28-vr-flashcard-game-decisions-2.md`.
- BUILD-001..003: strictly increasing Android versionCode counter (`scripts/version-code.mjs next --state <file> [--ini
  <DefaultEngine.ini>]`); optionally sets Unreal StoreVersion; a failed run never advances the state. Tests included.

### Changed

- Plan/spec (Kev 2026-11-07): an enemy arriving unanswered now writes FSRS Again, max one Again per encounter (D4, ENC-005);
  D7 upward-dodge question logged as open.

### Fixed

- NORM-001: the relay normalizer (`relay/lib/normalize.mjs`) now drops Unicode format characters (Cf: zero-width space/joiner,
  soft hyphen, BOM) after the combining marks, so an answer pasted with an invisible character matches; 5 new rows in
  `tests/fixtures/normalize.json`.

## [0.1.0] - 2026-10-28

### Added

- MIT license.
- Build plan (`docs/plans/2026-10-28-vr-flashcard-game.md`).
- Pairing relay `relay/` 0.1.0 (plan D6): `POST /pair` issues a 6-char code (TTL 900 s), `POST /pair/<code>` stores one deck,
  `GET /pair/<code>` polls and collects it once. Per-client-key rate limits: POST 10 per 60 s, GET polling its own 120 per 60 s bucket; fails
  closed on limiter errors. Decks validated server-side and rebuilt from a field allowlist with size caps. Hardening (RELAY-009..012):
  Content-Length precheck, trusted client key, CSP and security headers, `/pair` rewrites, no inline script. `RELAY_ENABLED` kill switch, no
  request-body logging. Automated tests.
- Shared answer-normalization fixture `tests/fixtures/normalize.json`, the contract for every normalizer implementation.
- Credits audit script `scripts/credits-audit.mjs`: fails on any asset file not listed in `CREDITS.md`. Tests included.
- Feature spec (`.claude/spec-cache/game/references/spec.md`) and `.gitignore` for secrets, signing keys, build outputs and
  local `.claude/` state other than the spec cache (REPO-001).
- Docs: `README.md`, `CREDITS.md`, `docs/privacy-policy.md` (draft), `docs/adr/0003-provenance.md`, `docs/devpost-draft.md`.
