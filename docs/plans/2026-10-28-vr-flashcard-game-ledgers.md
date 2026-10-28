# VR flashcard combat game: plan ledgers
Moved verbatim from [2026-10-28-vr-flashcard-game.md](2026-10-28-vr-flashcard-game.md); the M/A/D/S/Q IDs cited below live there.

## Ledger (finisher)
| ID | Sev | Finding | Change |
|---|---|---|---|
| FIN-1 | major | Slash needs hand contact within the 30 cm hand radius, but enemies spawn 1.2-3.5 m away; nothing brought them in reach | D13 strike slot at 0.5 m (wall emergence kept for M15); S3 travel + no-early-slash criteria; A15 |
| FIN-2 | major | Core asmdef is noEngineReferences (S1) but the deck parser is UnityEngine.JsonUtility (D5) | Game.Json adapter asmdef; validation in Core; object-root schema; missing-field and top-level-array rejects in S2 |
| FIN-3 | major | Kev's verbatim hosting constraint (Vercel/Netlify if web) conflicts with D1 (GitHub Pages) and was missing from must-keep, as were CREDITS-day-1, decks own/PD/CC, never-vendor, privacy policy, post-Dec-11 MemriPal | M18-M21 added; D1 GitHub Pages only from the public repo (free, matches M20's rationale), else Vercel; Q2 |
| FIN-4 | major | Constraint ladder cut starter decks to 1; M11 says "decks" | Ladder floor = 2 decks |
| FIN-5 | major | No session structure: player "hit" had no consequence, no run end, no <=10 min check (rules.md:126,128 bus-stop test) | D14 run loop + shield pips; S2 + S6 + S9 run-length criteria; Q8 |
| FIN-6 | major | EditMode (Mono) cannot prove String.Normalize/GetUnicodeCategory on IL2CPP Android with stripping | A14; on-device 10-case self-test in SP2 v2 and S11 RC; Latin-fold fallback |
| FIN-7 | major | Lingering doubt: G1 picks the recognizer on accuracy only, ignoring freeze resilience | ADR 0002 freeze-resilience row required at G1 (criterion). Default unchanged; Kev sees the trade-off |
| FIN-8 | major | Unfinished SP1/SP2 checks may run Nov 5, after the Nov 4 re-plan point; no rule if they fail then | Post-G1 failure rule: no engine switch after Nov 4; SP2b inside S4; pipeline escalation; Q7 |
| FIN-9 | minor | Card ID "hash" unspecified (GetHashCode is not stable) | D5 SHA-256 first 16 bytes hex; golden value test |
| FIN-10 | minor | Repeated wrong voice answers never reach orbs (trigger counted only misses) | D4 orb trigger = any 2 non-correct attempts; S2 3/3 mixes |
| FIN-11 | minor | Ultimate charge source/reset undefined (M4) | D4 charge rule; S2 tests |
| FIN-12 | minor | Answer window length undefined, so "0 mic opens outside window" was unverifiable | D2 6 s no-speech cap; S4 3/3 |
| FIN-13 | minor | Unverifiable or always-passing CRITERIA: "or limits documented", "all motion within 30 cm", "0 uncredited assets", "POST over limit" with no limit, "first-word clip" undefined, "2 testers" undefined | Each restated as a countable check (SP2 burst rule, S6 telemetry, credits audit script, 10 POST/min, clip definition, fresh testers) |
| FIN-14 | minor | SIGNALS not stated per slice (FLOW-016) | Per-slice SIGNALS line, "none" where none |
| FIN-15 | minor | Devpost requirements beyond the D11 paragraph unscheduled (rules.md:142 inspiration/how built/future plans/launch date, rules.md:155 testing instructions, rules.md:154 content rating) | S13 scope + 7/7 criterion; Kev actions |
| FIN-16 | minor | Network-off and hand-tracking-loss paths untested | S4 Wi-Fi-off run; D7 pause + S6 3/3 |
| FIN-17 | minor | C# and JS normalizations can drift (server accepts deck device rejects) | Shared normalize.json fixture run by both suites |
| FIN-18 | minor | Quest 3/3S first seen Nov 15 leaves 1 day for MRUK/FoV fixes | Target device by Nov 12 so S8 runs on it; hard Nov 15 unchanged. Superseded 2026-10-28 by the A4 waiver: no 3/3S, S8 + S11 on Quest 2 (A4-R2, A4-R3) |

## Ledger (adversary round 2)
| ID | Sev | Finding | Verdict | Reason / change |
|---|---|---|---|---|
| R2-COR-F1 | major | Fuzzy 0.85 accepts afferent/efferent, Prussia/Russia, hypo/hyper without reject list | ACCEPT | D3 adds exact 4-char prefix rule; S2 near-miss cases run with empty reject lists. Trade-off accepted: a garbled first syllable becomes a miss (no damage), never a false accept. |
| R2-COR-F2 | major | Outcome/SR grading undefined for orb-after-wrong, ultimate, wrong orb, margin fail, short answer, out-of-deck wrong | ACCEPT | D4 single outcome table; first scored attempt sets grade; non-empty unmatched = miss (blocks promotion, no damage); S2 9/9 row tests. Out-of-deck wrong stays no-damage (indistinguishable from STT garble) but can no longer promote. |
| R2-COR-F3 | major | Rolling baseline absorbs held/early dodge | ACCEPT | D7 frozen baseline at telegraph onset; S6 held/slow/accessibility lean tests (dup R2-FM-F2). |
| R2-COR-F4 | major | 120 deg arc exceeds Quest 3/3S FoV | ACCEPT | D8 +/-35 deg arc + in-view telegraph gate; S11 FoV check (dup R2-AA-F1); FoV check on Quest 2 since the A4 waiver (A4-R3). |
| R2-COR-F5 | major | File.Replace throws on first save | ACCEPT | D5 Move-if-missing else Replace; S6a fresh-dir EditMode + S12 fresh-install device check. |
| R2-COR-x1 | minor | NFKD without dropping Mn | ACCEPT | D3 drops combining marks; S2 accented case. |
| R2-COR-x2 | minor | Shared answers break margin/orbs; no min deck size | ACCEPT | D3 candidates owned by card sets; orbs from distinct answers; >=4 distinct answers at validation. |
| R2-COR-x3 | minor | Card-ID collisions not rejected | ACCEPT | D5 ID without punctuation strip; duplicate-ID drop; S2 tests. |
| R2-COR-x4 | minor | SP2b lacks 0-false-accept bar | ACCEPT | SP2b criterion restates it. |
| R2-COR-x5 | minor | 8 h budget cannot cover SP1+SP2 | ACCEPT | Dup R2-SC-F1. |
| R2-COR-S | simplicity | Negation and or/and guards redundant under prefix rule | ACCEPT (partial) | Negation guard dropped. or/and hedge guard KEPT: prefix rule does not block "X or Y" for long X, and hedges must be wrong, not miss. |
| R2-FM-F1 | major | Silent mode latches permanently on one transient STT error | ACCEPT | D4 per-card fallback, only mic denial latches; D2 mic re-acquire on resume; S4/S9 re-arm tests. |
| R2-FM-F2 | major | Rolling baseline absorbs early dodge | ACCEPT | Dup R2-COR-F3. |
| R2-FM-F3 | major | First release-config build with real SDKs/permissions only at S11 | ACCEPT | SP2 spike uploaded as v2 in release config with final permissions + stripping; voice + MRUK verified after invite install before G1. Replaces SP1's hello-hands v2. |
| R2-FM-F4 | major | Shared Wit app, unchecked quotas; F checks have no action | ACCEPT | ADR 0002 records limits; SP2 5-concurrent burst script; 429 -> per-card orbs; every F check names its action. |
| R2-FM-F5 | minor | Stale room scan; arc frame after recenter | ACCEPT | D8 head-outside-room fallback + play-forward recomputed on recenter; S8 8/8. |
| R2-FM-x1 | minor | Guard rejection damage unstated; duplicate IDs; arc frame | ACCEPT | D4 (hedge = wrong), D5, D8. |
| R2-FM-S | simplicity | Upload SP2 spike as v2 instead of hello-hands v2 | ACCEPT | Same as R2-FM-F3. |
| R2-SD-F1 | major | Wit token effectively public via APK + public invite URL | ACCEPT | D10 client token only, no intents/data, treated public (A13); judges-only Devpost field if available; ADR 0002 residual. |
| R2-SD-F2 | major | Passthrough video exposes home/brands/people | ACCEPT | D12; S13 frame review 0 hits; XR Simulator alternative. |
| R2-SD-F3 | major | gitleaks green proves nothing; build outputs not ignored | ACCEPT | S1 canary (uncommitted) + custom Wit rule; ignores Builds/, *.apk, *.aab, Temp/; check-ignore 6/6. |
| R2-SD-F4 | major | Per-IP KV counter drains quota; no freeze remedy | ACCEPT (modified) | D6: GET limit dropped, POST limit via Firewall rule or stock ratelimit with TTL keys, RELAY_ENABLED kill switch. "Server patches allowed during freeze" REJECTED (rules.md:168 risk): kill-switch flip only, Kev confirms at G0. |
| R2-SD-F5 | minor | Privacy page omits transcripts, IPs, logs, bystanders, deletion path | ACCEPT | S10 7/7 list; function never logs bodies; post-Dec-11 purge (Kev action). |
| R2-SD-x1 | minor | Read-then-delete not atomic | ACCEPT | D6 GETDEL; S10 concurrent GET case. |
| R2-SD-x2 | minor | "len >3" unit undefined | ACCEPT | D3 ">=4 normalized chars". |
| R2-SD-x3 | minor | Device JSON parser unspecified | ACCEPT | D5 JsonUtility. |
| R2-SD-S | simplicity | Drop GET counter, edge limit POST, KV = code -> deck + TTL | ACCEPT | D6. |
| R2-SC-F1 | major | 8 h spike budget not credible | ACCEPT | A1 ~14 h stated; SP1 trimmed (1 upload); restore test + v2 + privacy stub moved into SP2's single release-config upload; G1 default + Nov 5 AM overflow rule. |
| R2-SC-F2 | major | VR code entry + deck management unscheduled; KV stale | ACCEPT | D6 headset shows code, page posts; Upstash; S10 device criteria incl. delete confirm + Undo. M11 kept (pairing code + paste page both remain). |
| R2-SC-F3 | minor | SP3 trigger overlaps SP2b; no post-SP3 plan | ACCEPT | SP3 only on SP1 failure; Nov 4 re-plan if it wins; M13 evaluation via ADR 0001 (not a descope: M13 asks for evaluation). |
| R2-SC-F4 | minor | Device kill-mid-write test nondeterministic | ACCEPT | S6a EditMode corrupt/missing tests + 3/3 restart persistence. |
| R2-SC-F5 | minor | Nov 5 overloaded; versionCode script and CI misplaced | ACCEPT | Script in SP1; CI deferred to remote (Q2); S2 may spill Nov 6 AM, charged to Nov 16 buffer. |
| R2-SC-x1 | minor | IWSDK submission is a GitHub page link | ACCEPT | D1/SP3 GitHub Pages (rules.md:138 allows others, :140 and guidelines.md:60 name GitHub page; take the stricter). |
| R2-SC-S | simplicity | Headset-shows-code, Upstash TTL/ratelimit, SP3 on SP1 only, EditMode save test | ACCEPT | As above. |
| R2-AA-F1 | major | 120 deg arc vs FoV-aware rubric | ACCEPT | Dup R2-COR-F4; chose +/-35 deg (70 deg) + in-view gate over off-screen indicator (less UI). |
| R2-AA-F2 | major | Disclosure may trigger Adapted re-assignment without the required summary | ACCEPT | D11 dual-use Devpost paragraph; G0 shows risk. M5 claim unchanged. |
| R2-AA-F3 | major | Headset capture of passthrough unverified | ACCEPT | SP1 10 s capture criterion with XR Simulator fallback. |
| R2-AA-F4 | major | Budget; SP2 depends on SP1; second speaker unnamed; no G1 default | ACCEPT | SP2 DEPENDS SP1; G1 default; Q6 + 1-speaker fallback corpus with residual logged. |
| R2-AA-F5 | minor | AIO v81 vs ISDK v207; no gaze | ACCEPT (partial) | S1 version check + ADR 0001 record. Premise that v81 misses v207 REJECTED: hackathon.md:63 pairs "v81+ (v207)". Gaze affordance DEFERRED to Kev as Q5 (unrequested feature). |
| R2-AA-x1 | minor | S6 "exactly 3" vs ultimates | ACCEPT | D4 ultimate row; S6 criterion "with no ultimate". |
| R2-AA-x2 | minor | Typo fix resets progress; duplicates collide | ACCEPT (partial) | Duplicates handled (D5). Typo-reset REJECTED: content-addressed ID is intended (edited card = new card); starter decks freeze Nov 17. |
| R2-AA-x3 | minor | Golden pairs fixed before topic chosen | ACCEPT | S2 generic cases + topic cases after SP2. |
| R2-AA-S | simplicity | Drop GET counter | ACCEPT | Dup R2-SD-S. |

## Ledger (adversary round 1)
| ID | Sev | Finding | Verdict | Reason / change |
|---|---|---|---|---|
| COR-F1 | critical | SP2/G1 counts only true accepts; grammar ASR + n-best bias to false accepts | ACCEPT | SP2 adds >=15 wrong/noise utterances, 0 false accepts; grammar = all deck answers + [unk] (D2); n-best dropped (D3). |
| FM-F1 | critical | First Competition upload + invite install only at S12 (Nov 15) | ACCEPT | Moved into SP1, G1 gated on it (dup: COR-F4, AA-1). |
| COR-F2 | major | Lev 0.8 accepts antonym-like pairs; token-set, negation, "A", undefined ratio | ACCEPT | D3 rewritten: defined ratio, in-deck nearest + margin, reject list, negation/"or" guard, article guard; golden cases in S2. |
| COR-F3 | major | Empty due queue undefined | ACCEPT | Study-ahead rule (D5) + S2 test. |
| COR-F4 | major | No upload until S12; no keystore step | ACCEPT | SP1 (merged with FM-F1, SD-F2). |
| COR-F5 | major | New Experience needs conception in window; realm-of-recall predates | ACCEPT | G0 Kev confirmation + ADR 0003 + Devpost disclosure (D11). Division stays (M5). |
| COR-x1 | minor | "0 Meta SDK files under Assets/" unmeetable | ACCEPT | S1 criterion reworded to vendored sources only. |
| COR-x2 | minor | 2 ft is diameter per guidelines.md:47 | ACCEPT | <=30 cm radius satisfies both readings (M6, D7). |
| COR-x3 | minor | "2 timeouts" can't tell don't-know from STT failure | ACCEPT | D4 outcomes; orbs after 2 misses either way. |
| COR-x4 | minor | G1 on MemriPal deadline day | ACCEPT | G1 Nov 3. |
| COR-S | simplicity | Replace stacked matcher with normalize/aliases/nearest+margin | ACCEPT | D3. |
| FM-F2 | major | Soft STT errors count as wrong; cold mic clips words | ACCEPT | D4 no-damage path; D2 mic at slash contact + earcon; SP2 clip metric. |
| FM-F3 | major | Wall spawns not limited to arc; single-room test | ACCEPT | D8 distance+arc filter; S8 6-case matrix (dup AA-2). |
| FM-F4 | major | Fixed head center breaks on recenter; lean-in false dodge | ACCEPT | D7 rolling baseline, reset events, forward lean ignored; S6 tests. |
| FM-F5 | major | 13 back-to-back slices, no slack/cut order, Nov 9 overlap | ACCEPT (modified) | Nov 12 checkpoint + Nov 16 buffer + fidelity ladder. Cut order of features REJECTED where it hits M-items (relay, ultimates). |
| FM-x1 | major | Non-atomic save | ACCEPT | D5 temp + File.Replace + .bak; S6a test (dup SD-F5). |
| FM-S | simplicity | Drop relay | OVERRULE | M11 is Kev's verbatim ask; hardened instead (D6). |
| SD-F1 | major | Wit token in public repo; unrotatable after freeze | ACCEPT | D10 gitignore + build-time injection + gitleaks + dedicated app; weekly token check in F. |
| SD-F2 | major | Keystore not created/excluded/backed up | ACCEPT | D10 + SP1 restore test + versionCode 2 upload. |
| SD-F3 | major | KV token/validation/rate limit unspecified | ACCEPT | D6 function-only KV client, server-side validation, per-IP KV counter; S10 bundle grep. |
| SD-F4 | major | "No PII" false; enumerable digit codes | ACCEPT | Privacy page discloses Wit audio + deck retention; 32-symbol code, delete on first read, GET rate limit. |
| SD-F5 | minor | Non-atomic Leitner save | ACCEPT | Same as FM-x1. |
| SD-x1 | minor | TMP rich-text injection; device caps; stable card ID | ACCEPT | D6 rich text off + device re-validation; D5 hash ID. |
| SD-S | simplicity | Move relay to post-Dec-11 branch | OVERRULE | M11 must-keep, non-deferrable. |
| SC-F1 | major | Cut S10 relay | OVERRULE | M11 must-keep; risk reduced by D6 minimal design and fail-soft. |
| SC-F2 | major | Spikes overflow 6 h, land on Nov 4; drop SP3, test Voice SDK only | ACCEPT (partial) | Spikes start Oct 28, budget 8 h, SP2 Voice SDK only (SP2b conditional), G1 Nov 3. SP3 kept as conditional (M13 evaluation; costs 0 unless triggered). |
| SC-F3 | major | S6 overloaded on half day; shield vs ultimate collide | ACCEPT (partial) | S6 moved to Nov 10; Nov 9 = S6a; shield replaced by accessibility toggle. Poke-orb ultimate REJECTED: collision gone once shield removed. |
| SC-F4 | minor | VR arena unscheduled, penalized | ACCEPT | MR only (D8). |
| SC-F5 | minor | Matcher over-built (number words, n-best) | ACCEPT | Dropped (D3); aliases cover. |
| SC-x1 | minor | Covers tags vs NUnit; no spec file | ACCEPT (adapted) | `// Covers:` above each [TestFixture]; spec file created in S1. Tag mandate itself kept. |
| AA-1 | major | Upload late; 2nd-account test can falsely pass via App Sharing/org | ACCEPT | Non-org account, App Sharing off (SP1, S12). |
| AA-2 | major | Quest 2 not a Quest 3 proxy; scene-but-no-wall gap | ACCEPT | A4 Quest 3/3S test required (waiver logged); D8 fallback case added. Waived 2026-10-28 (A4; residuals A4-R1..R4). |
| AA-3 | major | SP2 corpus single speaker, undefined words/latency start | ACCEPT | Deck-derived corpus, 2+ speakers, noisy take, end-of-speech latency, false-accept count. |
| AA-4 | major | Spike/schedule collides with MemriPal | ACCEPT (modified) | Same as FM-F5; named cut list (S7, S10) REJECTED as M-items. |
| AA-5 | minor | Conception evidence; Q3 reads as concealment | ACCEPT | D11 + Q3 reworded. |
| AA-x1 | minor | Nothing increments versionCode | ACCEPT | D10 build-script counter; SP1 v2 upload. |
| AA-S | simplicity | Drop relay, optional static JSON URL | OVERRULE | M11 must-keep. |
