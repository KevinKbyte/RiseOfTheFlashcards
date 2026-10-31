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
- RELAY-013: POST /grade (plan D3a, GRADE-003) body {front, answer, aliases?, reject?, transcript}; unknown fields dropped, RELAY-010
  caps + RELAY-004 rich-text rule, transcript key <=200 chars (MATCH-005), else 400 with no echo. Relay re-runs match() on a one-card
  deck from the body; Claude is called only on 'miss' (hedge/reject always first). 200 {verdict:"correct"|"miss"}; any non-miss
  matcher result, Claude non-correct or failure -> "miss".
- RELAY-014: GRADER_ENABLED !== "true" -> /grade 503 and deck POST skips GRADE-001 (deck still stored); RELAY_ENABLED unaffected.
  /grade has its own per-client-key bucket, 30 per 600 s (Upstash prefix relay:ratelimit:grade), separate from RELAY-005/009; a
  throwing limiter or counter -> 503 (headset: miss).

## Normalization (plan D3/D6)

- NORM-001: normalize(s) = NFKD, drop combining marks (Unicode Mn), lowercase, each punctuation char (Unicode P)
  -> space, collapse whitespace runs to one space, trim. Shared fixture tests/fixtures/normalize.json
  ([{input, expected}]) is the contract for every implementation (JS relay now, engine side later).

## Answer matcher (plan D3, S2)

relay/lib/matcher.mjs, deterministic (no LLM inside; GRADE-*); reuses relay/lib/normalize.mjs. Matcher key = NORM-001 then strip one
leading article (a/an/the) only if the remainder is non-empty. Candidates = distinct keys of every card answer + alias
in the deck, each mapped to the set of cards owning it. Top STT hypothesis only; no number-word conversion.

- MATCH-001: Exact -> correct: transcript key equals a candidate owned by this card (a candidate shared with other
  cards still counts).
- MATCH-002: Fuzzy -> correct: both strings >=4 key chars; ratio = 1 - lev(a,b)/max(len a, len b) >= 0.85; first 4
  key chars identical; nearest candidate owned by this card; margin (score - rival >= 0.1 - 1e-9, so an exact 0.1
  margin passes) over the best candidate NOT owned by this card. Any check failing -> not fuzzy-accepted. The >=4-char
  checks are a guard the ratio rule already implies.
- MATCH-003: Wrong: the MATCH-001/002 rules resolve to a candidate not owned by this card; or exact key hit on this
  card's `reject` list (near-miss, e.g. efferent for afferent); or hedge guard: transcript has an "or"/"and" token
  absent from every one of the card's answer + aliases ("X or Y", "X and Y"). No negation guard: "not X" fails the
  ratio rule -> miss, not wrong. Precedence, first hit wins: (1) hedge -> wrong; (2) exact reject-list hit -> wrong;
  (3) exact own -> correct; (4) exact other -> wrong; (5) fuzzy own -> correct; (6) fuzzy other -> wrong; (7) else miss.
- MATCH-004: Miss: any other non-empty transcript (length, ratio, prefix or margin fail). Empty transcript is
  Didn't catch (plan D4), not a matcher outcome. With live grading on, a miss may be upgraded to correct (GRADE-003).
- MATCH-005: Input limits. match() throws TypeError when: deck not an array; any card not an object with string `id`
  and string `answer`; `aliases`/`reject` present but not an array of strings; cardId not in deck; transcript not a
  string; transcript key empty (punctuation/whitespace only; caller shows Didn't catch per D4). Throws RangeError when
  the transcript key exceeds 200 chars. Fuzzy skips candidates with length ratio min/max < 0.75 (cannot reach 0.85 or
  matter within the margin): pure optimization, identical results.

Deferred to relay integration:
- validate.mjs deck schema is front/back without id; matcher expects {id, answer}. Relay assigns card ids server-side
  and never accepts a client cardId unchecked.
- validate.mjs MAX_SIDE_CHARS/MAX_ENTRY_CHARS must also be enforced on normalize(s).length (NFKD expansion).

## Claude grading (plan D3a, M12; Kev 2026-10-31, ledgers C-1)

- GRADE-001: Load-time aliases. Deck POST (RELAY-002) asks Claude for extra aliases + reject entries per card before storing. Output
  is validated and capped like client input (RELAY-004/010 caps per merged list, rich text, dedupe by matcher key); an alias whose key
  matches another card's answer/alias, or a reject matching this card's answer/alias, is dropped. Claude failure or timeout (10 s)
  -> deck stored unaugmented, never a 4xx/5xx caused by Claude.
- GRADE-002: Starter decks get GRADE-001 once, offline at build time, by a script; output committed and reviewed in the diff. Play
  never calls Claude for aliases; matching stays deterministic and offline.
- GRADE-003: Live grading, upgrade-only. Only when GRADE-005 is ON, the recognizer is free-form, and match() = miss on a non-empty
  transcript (never empty or "[unk]"): headset POSTs /grade (RELAY-013). Claude correct -> Voice correct (plan D4); wrong, error,
  timeout, offline -> Voice miss (no hit; counts toward the 2-attempt orb trigger). Never overrides a matcher correct/wrong.
- GRADE-004: During grading the encounter is in a 'grading' state: enemy advance + attack timer frozen; the 3 s Hard-STT clock stops
  at final transcript. Client timeout 2000 ms -> miss. Circuit breaker: 2 consecutive failures -> matcher-only for the session.
  Advance includes the ENC-004 creep.
- GRADE-005: In-game Settings toggle "Live AI grading", persisted. Default OFF unless SP2/G1 picks a free-form recognizer
  (Whisper); with the grammar recognizer it sends nothing.
- GRADE-006: Claude call: forced tool `grade`, input_schema {verdict: enum["correct","wrong"]}, temperature 0, small max_tokens;
  anything else -> miss. Card + transcript in delimited data tags, labeled untrusted. Model ID pinned in server env:
  claude-haiku-5-5 dev/test, claude-sonnet-5-5 judged/demo. ANTHROPIC_API_KEY server-side only (as RELAY-008); logs never hold
  transcripts (as RELAY-007).
- GRADE-007: Cost caps: global daily Upstash counter over GRADE-001 + GRADE-003 calls fails closed (miss / unaugmented deck);
  Anthropic console spend cap below the $200 credit, auto-reload off; GRADER_ENABLED flip is a freeze-window op (plan D6).
- GRADE-008: Grading sits behind an injectable grader interface; a stub (fixture map transcript -> verdict, unknown -> miss, timeout
  and error modes) serves every gating unit/E2E test (plan M23), which never hit the network. A live golden set (>=40 miss-bucket
  cases incl. injection) runs manually, non-gating, against the ship model (Sonnet) before RC.

## Encounter flow + card panel (plan D13, D13a; Kev 2026-10-31, ledgers EN-1, EN-2)

- ENC-001: Enemy emerges at its wall spawn (D8), advances toward a reach line ~0.6 m in front of the play-forward head and halts
  there if unrevealed. Reveal = select or slash the card-enemy at ANY distance. Max 1 engaged enemy (revealed, or halted at the
  reach line); others queue at their walls. EN-1 slash-only-at-reach-line wording **Superseded by** EN-2 (verbatim in ledgers EN-2).
- ENC-002: Reveal -> card face pops out as the ENC-003 panel and the enemy keeps coming, no reset: revealed inside 2 m -> knocked
  back to 2 m (ultimate knockback mechanics), else continues from where it is, toward the 0.5 m strike slot (calibrated 0.40-0.60
  m); telegraphs and attacks happen only there. Re-slash after a miss is valid at any distance. EN-1 always-knockback-to-~2 m
  wording **Superseded by** EN-2.
- ENC-003: Panel ~70% opaque with dark backing, world/body-locked, never head-locked; ~1.0 m away, ~15 deg below eye line, yaw-only
  lazy-follow with ~20 deg dead zone, anchored to the D7 dodge baseline; never occludes the engaged enemy. Text sized at ~1 m.
- ENC-004: Creep speed fixed = (2.0 - 0.5) m / 8 s = 0.1875 m/s, so reveal -> strike slot >= 8 s (>= 6 s no-speech cap + 2 s
  grading timeout); earlier reveal = more time; the pacing knob. Grading (GRADE-004) freezes it. EN-1 "creep time, default 8 s"
  **Superseded by** EN-2.
- ENC-005: Arrived unanswered -> 2 s telegraph -> hit (dodgeable; 1 hit per encounter); no FSRS write and no orb-trigger attempt of
  its own; then knockback to 2 m + creep repeat.
- ENC-006: Correct answer in any revealed phase (creep, telegraph, after knockback) shatters the panel and peels a card; a
  multi-card enemy is knocked back per card by the ENC-002 rule. Ultimate on a creeping enemy pushes it back further, panel kept,
  creep resumes from there. EN-1 "also during the telegraph" scope **Superseded by** EN-2.
- ENC-007: Card-enemies show a cartoon face (eyes + mouth, angry/mischievous) on the player-facing side; it is not the card face:
  the prompt stays hidden until reveal. Theme: cards rising against the human.

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
