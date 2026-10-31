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
- RELAY-005: Rate limit POSTs, 10 per 60 s per client key (RELAY-011 clientKey; both routes); 11th -> 429. GETs
  never rate-limited (**Superseded by RELAY-009**: GETs have their own bucket and never draw on this POST budget).
- RELAY-006: RELAY_ENABLED !== "true" -> 503 on every route.
- RELAY-007: The handler never passes request bodies or deck text to its logger.
- RELAY-008: The Upstash token is read server-side only; it never appears in any file under the static page directory.
- RELAY-009: GET /pair/<code> is rate-limited per client key in its own bucket, 120 per 60 s (121st -> 429, also for
  unknown codes), separate from the POST bucket (Upstash prefix relay:ratelimit:poll vs relay:ratelimit) in both
  directions, so 1/s headset polling is never throttled. relay/lib/http.mjs POLL_RATE_LIMIT = {limit:120, windowSec:60}.
- RELAY-010: The stored and served deck is rebuilt from a field allowlist (version, title; per card front, back,
  aliases, reject); unknown fields (incl. __proto__) are dropped silently, never a 400. Caps, 400 one past, accepted
  at the cap: title <=120 chars, front/back <=200, each alias/reject entry <=100, <=10 aliases and <=10 rejects per
  card. Rejection errors never echo deck content; a rejected deck is not stored.
- RELAY-011: relay/lib/http.mjs clientKey = first x-vercel-forwarded-for entry, else x-real-ip, else first trimmed
  x-forwarded-for entry, else "unknown" (blank header = absent). readBody refuses a declared Content-Length >204800
  with 413 before reading the body (undeclared or <=204800: read normally). A throwing POST or GET rate limiter
  -> 503 (fail closed: nothing stored, no body or deck text logged).
- RELAY-012: relay/vercel.json rewrites /pair -> /api/pair and /pair/:code -> /api/pair/:code; every route sends a CSP
  (default-src 'self', no inline script), X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer. Paste page
  script/style live in public/app.js + public/app.css (same-origin src, no inline event handlers). codeFromPath reads
  /pair/<code> or /api/pair/<code>; one trailing slash on /pair/<code>/ is ignored for GET and POST.

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

## Build tooling (plan line 191, SP1)

- BUILD-001: `node scripts/version-code.mjs next --state <file>` reads {"versionCode":N} (missing file = 0), writes
  N+1 and prints it, exit 0. Corrupt state (bad JSON/empty, N not a non-negative integer, or N >= 2100000000 because
  N+1 would exceed the Google Play max of 2100000000) -> exit 1, stderr message, file unchanged.
- BUILD-002: Optional `--ini <DefaultEngine.ini>` sets StoreVersion=<N+1> in
  [/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]: replaces the existing line, else adds one inside the
  section, else appends the section. All other bytes unchanged (CRLF kept); StoreVersion lines in other sections are
  never touched. Missing ini file -> exit 1, nothing written.
- BUILD-003: Strictly increasing; a failed run never advances the state. Unknown subcommand or missing --state ->
  exit 2 with usage on stderr.

## Repo hygiene

- REPO-001: .gitignore ignores .claude/* except !.claude/spec-cache/ (local settings, worktrees stay out) and no
  longer ignores Build/Android/ (UE Android manifest stays trackable); Binaries/, Intermediate/, Saved/, *.keystore,
  *.apk, .env stay ignored; Config/DefaultEngine.ini and relay/vercel.json stay trackable.
