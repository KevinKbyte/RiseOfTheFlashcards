# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning:
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MATCH-001..004: deterministic answer matcher (`relay/lib/matcher.mjs`) with 62 golden cases (`tests/fixtures/matcher-golden.json`);
  early start approved by Kev 2026-10-31.
- BUILD-001..003: strictly increasing Android versionCode counter (`scripts/version-code.mjs next --state <file> [--ini
  <DefaultEngine.ini>]`); optionally sets Unreal StoreVersion; a failed run never advances the state. Tests included.

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
