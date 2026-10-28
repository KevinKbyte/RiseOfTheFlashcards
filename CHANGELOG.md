# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-28

### Added

- MIT license.
- Build plan (`docs/plans/2026-10-28-vr-flashcard-game.md`).
- Pairing relay (plan D6): headset requests a 6-char code, companion page posts a deck, headset collects it once; server-side deck validation,
  POST rate limit, `RELAY_ENABLED` kill switch, no request-body logging. Automated tests.
- Shared answer-normalization fixture `tests/fixtures/normalize.json`, the contract for every normalizer implementation.
- Credits audit script `scripts/credits-audit.mjs`: fails on any asset file not listed in `CREDITS.md`. Tests included.
- Feature spec (`.claude/spec-cache/game/references/spec.md`) and `.gitignore` for secrets, signing keys and build outputs.
- Docs: `README.md`, `CREDITS.md`, `docs/privacy-policy.md` (draft), `docs/adr/0003-provenance.md`, `docs/devpost-draft.md`.
