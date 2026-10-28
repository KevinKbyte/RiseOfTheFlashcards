# Game feature spec

Source plan: docs/plans/2026-10-28-vr-flashcard-game.md (D-, S-, M-IDs there).

## Relay (plan D6, M11)

- RELAY-001: POST /pair creates a 6-char Crockford base32 code (alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ)
  with set-if-absent, TTL 900 s; returns 201 {code}. Retries on collision.
- RELAY-002: POST /pair/<code> stores a deck only while the code is live and still pending (first deck wins);
  404 unknown/expired, 409 deck already posted, 400 bad code format. Code match is case-insensitive.
- RELAY-003: GET /pair/<code> returns 202 {status:"waiting"} while pending; 200 deck with atomic get-and-delete
  once posted (two concurrent GETs: exactly one gets the deck); 404 unknown/expired/already taken.
- RELAY-004: Deck validation server-side: body <=200 KB UTF-8 (413); valid JSON object root
  {version:1,title,cards:[{front,back,aliases?,reject?}]} (400); <=500 cards; non-empty trimmed front/back;
  >=4 distinct normalized backs; no rich-text tags (/<\/?[A-Za-z][^>]*>/) in any string (400).
- RELAY-005: Rate limit POSTs only, 10 per 60 s per IP (both routes); 11th -> 429. GETs never rate-limited.
- RELAY-006: RELAY_ENABLED !== "true" -> 503 on every route.
- RELAY-007: The handler never passes request bodies or deck text to its logger.
- RELAY-008: The Upstash token is read server-side only; it never appears in any file under the static page directory.

## Normalization (plan D3/D6)

- NORM-001: normalize(s) = NFKD, drop combining marks (Unicode Mn), lowercase, each punctuation char (Unicode P)
  -> space, collapse whitespace runs to one space, trim. Shared fixture tests/fixtures/normalize.json
  ([{input, expected}]) is the contract for every implementation (JS relay now, engine side later).

## Credits audit (plan M18, S1)

- CRED-001: scripts/credits-audit.mjs scans asset roots (default: Assets/ and Content/ under the repo root,
  whichever exist; --root overrides; --credits overrides the CREDITS.md path) and lists every non-code file not
  covered by CREDITS.md. Covered = its repo-relative forward-slash path appears in backticks in CREDITS.md, or a
  backticked directory prefix ending in "/" contains it. Skipped code/metadata extensions:
  .cs .meta .asmdef .asmref .cpp .h .hpp .c (Unreal *.Build.cs / *.Target.cs fall under .cs).
- CRED-002: Exit 0 when all covered (including when no asset root exists), exit 1 listing each uncovered path,
  exit 2 when CREDITS.md is missing.
