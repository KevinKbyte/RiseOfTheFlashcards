# VR flashcard combat game: plan ledgers
Moved from [2026-10-28-vr-flashcard-game.md](2026-10-28-vr-flashcard-game.md); the M/A/D/S IDs cited below live there;
resolved Q/ENGINE/D15/D19/G0a/G0b bullets in Resolved decisions below.

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

## Resolved decisions
Moved from the plan's Open questions 2026-10-28 (verbatim); the plan's pointer line names each ID.
- ENGINE Unreal 5.8 (Kev 2026-10-30, A2; 5.7.4 fallback only) + Meta XR v207, spike-gated by Nov 2; Unity 6.3 LTS fallback (M9, M13, A2, A3, A14, D1, D2, D5, G1).
- Q1 Video on a new YouTube channel for the game, public (A7).
- Q6 Second SP2 speaker = Kev + TTS voices; residual logged (Slices header).
- Q7 SP1 creates a backup Meta dashboard app; pipeline-red decision moves from Nov 12 to Nov 8; last-green invite URL goes into the
  Devpost draft early.
- Q10 SP3 (IWSDK) not retired: HELD as a last-resort fallback, run only if both the UE spike and the Unity fallback fail G1; not
  scheduled (D1, SP3, G1).
- Q2 Repo public when? Private GitHub remote now with CI gitleaks; public Nov 3 (G1) once a full-history scan is green and .gitignore
  covers .claude/ (A6, D10, G1).
- Q3 Title "Rise of the Flashcards" (Kev 2026-10-28, after "Cards: Uprising" and "Flashcards Fight Back"); nods to Rise of the Planet
  of the Apes without copying the franchise title; the "Planet of the ..." riff is NOT used anywhere (Planet of the Apes is a
  Disney/20th Century trademark; Jack Daniel's v. VIP 2023 weakens parody defense for source-identifying use; R11 originality rule
  makes it a disqualification risk); web-checked 2026-10-28, no game by this name; nearest concept itch.io "Flashcard Hero" (flashcard
  RPG combat), so Devpost differentiates on VR + voice answers; prior realm-of-recall still disclosed on Devpost.
  Taglines (Kev 2026-10-28): "Humanity forgot them. They didn't forget." / "You skipped your reviews. They noticed." / "The cards
  remember."
- Q4 Starter decks: Opposites, World Capitals, Basic Science; no Spanish; locked by Oct 30; S2 deck-lint gate; cut Basic Science
  first (A10, SP2, S2, ladder).
- Q5 Gaze: the D8 +/-40 deg in-view gate is the head-gaze mechanic in ADR 0001 + Devpost; gaze-dwell select (1.2 s) is a D15
  experimental toggle (D8, G1, S9).
- Q8 Keep 0.5 m / 12 cards / 5 pips; max 1 hit per encounter; strike slot per-player 0.40-0.60 m; first run 6 cards, no-fail; S9 adds
  early-end rate; pacing is the tuning knob, not counts (D13, D14, S2, S9). D19 leaves the graded counts unchanged; Overtime is ungraded.
- Q9 Base build = 1 ultimate type fired repeatedly; second mastery-unlocked type is a D15 experimental toggle (S7, ladder).
- D15 Experimental settings pane (new; S9 calibrates each toggle on/off; underperformers ship OFF, unmentioned).
- Q11 99% win measure: every card in the selected deck(s) shown this run (not-due cards served ungraded, no Leitner write), then
  accuracy over the last 90 s of answers >=99% -> WIN; window tuned 60-120 s in S9 (M24, D19, S2, S9). Amended 2026-10-28 by K-b2 and the two-tier
  WIN (E-FS-7).
- Q12 Slash input: both controllers and hand tracking (M1, M6, D17, S3).
- D19 Wave survival (new; M24): graded waves, ungraded Overtime, WIN unless Endless, daily grade lock.
- G0a New Experience claim kept with D11 disclosure; division field set at S13 (guidelines.md:101). Pre-ruling email
  (MetaHorizonStart@meta.com) dropped 2026-10-28 (Kev): repo first commit 37d0378 is 2026-10-28, inside the window starting
  2026-09-24 (rules.md:91), with no pre-existing code, so the New Experience Division is not in question.
- G0b Relay fail-soft automatic; judging-period ops only {RELAY_ENABLED off, byte-identical privacy redeploy}, logged + disclosed in
  Devpost testing instructions; S10 Upstash idle-archive check (D6, S10, F, S13).

## Adversarial cheat sheet (round 1; superseded by the plan's sheet)
Moved from the plan 2026-10-28; long lines rewrapped, wording unchanged.
- Primary technical risk: the headline voice mechanic could die silently for judges. Any brief speech-recognition fault (system menu, network blip,
  429) latched silent mode for the rest of the session. All judges share one Wit app whose client token is effectively public, with unchecked
  quotas. And the first release-config build with stripping plus mic/scene permissions didn't happen until Nov 15.
- Fix: speech failures now fall back to orbs for that card only, with voice retried on the next card and the mic re-acquired on resume;
  only mic-permission denial latches silent mode. The Wit client token is treated as public, the Wit limits go in ADR 0002, and SP2 runs a
  5-concurrent burst test. The SP2 voice spike ships as versionCode 2 in release config, with final permissions and the restored keystore,
  and must pass voice + MRUK checks after an invite-URL install before G1. Also: the matcher gets a 4-char prefix rule and a single
  outcome/grading table, the dodge baseline freezes at telegraph onset, and the spawn arc is +/-35 deg. Finisher pass: enemies now advance
  from the wall to a 0.5 m strike slot (they were out of hand reach). Core stays engine-free (JsonUtility moved to an adapter). A run loop +
  shield pips give a <=10 min session. String normalization gets an on-device self-test on IL2CPP. G1 must record a freeze-resilience row.
  Kev's licensing/hosting/privacy asks are listed as M18-M21, and the deck floor is 2.
- Lingering doubt: should cloud Wit be the default recognizer at all? On-device grammar ASR (SP2b) would remove the cloud dependency that can't be
  patched or re-keyed during the freeze, but it snaps noise onto deck answers. G1 now records freeze resilience in ADR 0002, but the default still
  rests on SP2 accuracy, so the call is Kev's once the row is written.

## Ledger (eval round 1: D7 controllers, D19 WIN, plan split; offload vr-plan-adversary-eval-20261028-193242)
IDs carry an E- prefix (this eval) to avoid clashes with the ledgers above.
| ID | Lens | Sev | Finding (short) | Verdict | Reason / change |
|---|---|---|---|---|---|
| E-COR-1 | correctness | critical | Fix (i) ramp-hold does not fix big selections; real cause is fixed 5 pips + coverage cost | ACCEPT | mc.txt L31/L39 + arbiter re-run: true no-ramp 90 cards WIN 66.0%, median 39.2 min; 0 hit risk still 39.2 min; 500 cards hits the 3 h cap. Binding break of M24 "all decks" -> Kev ask K-b1 |
| E-FM-3 | failure-modes | major | Same as COR-1 | ACCEPT (dup) | Merged into K-b1 |
| E-AA-1 | assumption | critical | Same as COR-1; adds single-run time bound (>=67 min at 8 s floor) | ACCEPT (dup) | Merged into K-b1; time, not only pips, is binding |
| E-COR-2 | correctness | major | Fix (iii) full_window is a no-op (measures from first answer); WIN fires on the coverage answer | ACCEPT finding; OVERRULE its agent-fill fix | Verified d19_win_sim.py:180. Where the window starts is part of Kev's measure (Q11 "then"), so it goes to Kev as K-b2, not agent-filled |
| E-SIM-4 | simplicity | minor | Drop (iii) | ACCEPT | (iii) dropped as worded; the real question is re-homed to K-b2 (not dropped) |
| E-COR-3 | correctness | major | F1's 16.4% "false wins" are mostly players who know every card | ACCEPT | Arbiter split: 119/1000 runs know all 20 cards, all win; 45/1000 (4.5%) are real false wins. F1 restated |
| E-AA-2 | assumption | major | Same as COR-3; false wins come from ultimate-only cards (F4) and order (F6) | ACCEPT (dup) | With fix (ii) + post-coverage window, B WIN 10.5% (below the 11.9% genuine rate) |
| E-COR-4 | correctness | major | D7 harm misstated: controller players are paused forever (hands untracked), not hit unfairly; A1 has no resume rule | ACCEPT | Root problem (a) rewritten; pause = union rule with resume rule; controller-only S6 case |
| E-SIM-5 | simplicity | major | A1 active-type state + either-controller clause is asymmetric; use "no tracked pose -> pause" | ACCEPT | Same rule as COR-4 fix; no active-input state |
| E-AA-5 | assumption | major | A4's controller forward axis never filters; multimodal on Quest 2 unverified | ACCEPT | Controller arming gate = both triggers held (A1 chord); multimodal check = SIGNAL SIG-1; union pause works either way |
| E-COR-x | correctness | major | A4 facing gate always passes on controllers -> slash-speed thrust fires ultimate | ACCEPT (dup AA-5) | Same fix; S7 two-controller-thrust 0-fire case |
| E-FM-1 | failure-modes | major | Pause cancels the attack -> hide hands at telegraph = immunity; resume resets baseline | ACCEPT | Pause FREEZES the attack, keeps the frozen baseline, replays the full telegraph on resume; never cancels |
| E-SEC-2 | security-data | major | Same exploit used to farm WIN/PB; also cap pauses per attack | ACCEPT freeze; REJECT cap | Freeze + replay removes all gain (the attack always resolves); a cap would land hits on genuine tracking loss |
| E-FM-2 | failure-modes | major | Ultimate push passes through the strike-slot card -> also a slash; S7 not per input | ACCEPT | While the ultimate is armed (charged + gate held) slash registration is suppressed; S7 per-input cases |
| E-SEC-1 | security-data | major | Pause leaves mic open / transcript in flight -> bystander audio to cloud Wit, Leitner write while paused | ACCEPT | Pause closes mic, discards in-flight transcript (0 grade, 0 Leitner write); fresh slash re-arms voice; S6 case |
| E-FM-4 | failure-modes | major | Excluding Didn't catch opens silence + orb-recognition WIN route; sim cannot see it | ACCEPT | Answer def = D4 promote predicate (orb after silence is not clean); sim limitation named |
| E-SIM-3 | simplicity | major | Three answer defs + new misses def collapse into the D4 L116 promote predicate | ACCEPT | One predicate for window, misses-first and Leitner. Arbiter sim: noisy room WIN 94.3% (plan def 88.2%) |
| E-AA-3 | assumption | major | STT rejects are per-card correlated -> WIN impossible for that deck under every def; count orb first pick as clean | ACCEPT finding as residual; REJECT fix | The fix re-opens FM-4 (silent twice, recognise orb, counted clean). Mitigation: existing S2 deck-lint (3-char, homophone, alias) + author aliases; residual named |
| E-SEC-3 | security-data | major | "All decks" undefined for hidden (deleted) imported decks | ACCEPT | All decks = starter decks + non-hidden imports, snapshotted at round start; S2 case |
| E-SEC-x | security-data | minor | Fix (i) makes PB (single int) incomparable across selections | DEFER (conditional) | Moot now: fix (i) dropped. Re-homed: if Kev picks K-b1 option B, key PB per selection in the same edit |
| E-SEC-4 | security-data | minor | No CRITERIA checks D18 debug commands are stripped from RC builds | ACCEPT | One S11 CRITERIA clause: RC build registers 0 debug commands 1/1 |
| E-SIM-wl | simplicity | minor | Skip the pre-build Kev ask on gesture feel; use D18 check-in #2 | REJECT | User-relayed handoff L127 + item 5 DISPATCH mark D7 controller mapping ASK-GATED; ask stays, bundled in one batch; feel re-checked at D18 check-in #2 |
| E-COR-5 | correctness | minor | C1 alone too small: rewrap of L147/L382 forced by hook :200-211 | ACCEPT | Measured +5 (L147) and +3 (L382) before new text; do C1 + C4 now |
| E-SIM-1 | simplicity | major | Same budget gap | ACCEPT (dup) | Budget table below |
| E-AA-4 | assumption | major | Same budget gap | ACCEPT (dup) | Budget table below |
| E-FM-5 | failure-modes | major | L491/L500 prose >150 chars cannot be moved verbatim (only tables/URLs exempt, hook :42-47); order matters (:214) | ACCEPT | Move cheat sheet as table rows (exempt, verbatim kept); ledgers append, then plan removals, then plan growth |
| E-SIM-2 | simplicity | minor | C1 pointer line redundant; L488 dead line not counted | ACCEPT | No C1 pointer (L486 links ledgers); L488 moves with the block. C4 still needs 1 pointer line (resolved Q IDs move) |
| E-SEC-5 | security-data | minor | Wit "lingering doubt" is an open Kev decision; C4 would move Q11 and orphan L10 | ACCEPT | Append before delete; doubt kept as an Open-questions line; Q8, Q11, Q12 stay in plan; grep dangling pointers |

## Ledger (eval round 2)
| ID | Lens | Sev | Finding (short) | Verdict | Reason / change |
|---|---|---|---|---|---|
| E-COR2-1 | correctness | critical | Full telegraph replay on EVERY resume -> hide before each hit frame = 0 hits all run; SEC-2 rejection premise false | ACCEPT | Replay at most once per attack; a replayed attack ignores further tracking loss and resolves at its hit frame (dodge is head-based, no input needed). SEC-2 cap rejection re-justified on this rule. S6 "hide twice in one telegraph -> resolves 3/3" |
| E-SIM2-2 | simplicity | major | Freeze + kept baseline + replay = 3 mechanisms; kept baseline goes stale; restart attack from onset instead | ACCEPT (stale baseline, drop stored state); REJECT (restart on every resume) | Restart-every-resume reopens COR2-1 (infinite stall). Merged rule: freeze; on first resume take a fresh D7 baseline (1.5 s) then replay once. No baseline carried through the pause |
| E-FM2-4 | failure-modes | major | Kept baseline stale after re-seat; lap-rest tracking flicker restarts telegraph forever | ACCEPT | Same merged rule (fresh baseline; replay once, never restarted). Residual: hands-in-lap flicker can add one replay per attack (named) |
| E-SIM2-c1 | simplicity | hyp | System/menu pause and recenter still CANCEL the attack -> same immunity exploit | ACCEPT | One rule for every interruption (tracking loss, system/menu pause, recenter): freeze, fresh baseline, replay once. "Cancels that attack" deleted from L147. S6 case |
| E-AA2-3 | assumption | major | No minimum answers; Wi-Fi off empties the window (HE excluded) -> vacuous 99% WIN; hide 90 s then 1 answer -> WIN | ACCEPT (merged into the window-floor fix) | WIN needs >= window seconds of UNPAUSED play since the window opened AND >= 4 counted encounters (tuned with the window in S9), all passing the D4 predicate. HE encounters stay excluded but never count toward the 4, so Wi-Fi off = no WIN (honest: no evidence) |
| E-COR2-4 | correctness | major | Same empty-window hole; sim hides it (requires non-empty window) | ACCEPT (dup AA2-3) | Same fix; S2 "0 or 3 counted encounters -> no WIN 2/2". Arbiter note: the sim cannot produce it because its Overtime re-queues every HE encounter as a miss first, so coverage never completes (out4 W rows 0.0%); the plan text, not the sim, has the hole |
| E-FM2-1 | failure-modes | critical | One correct answer can win (K-b1 A save coverage, or free 90 s pause) | ACCEPT (dup AA2-3) | Same fix + S2 "1 answer after 90 s pause -> no WIN 1/1", "first answer of a run with save coverage -> no WIN 1/1" |
| E-SEC2-1 | security-data | critical | Same: Wi-Fi off / Wit outage / 429 storm -> orbs-only WIN with zero evidence | ACCEPT (dup AA2-3) | Same fix + S2 "all-Hard-STT window -> no WIN 1/1". REJECT its simplicity alternative (grade HE encounters as not-clean): a single 429 inside the window would fail an expert for a system fault; the floor closes the hole without that cost |
| E-SEC2-c1 | security-data | correctness | K-b2 "Yes" needs "elapsed since coverage" or 1 answer right after coverage wins | ACCEPT (dup AA2-3) | "Elapsed unpaused seconds" is now in the WIN text for both K-b2 options |
| E-COR2-2 | correctness | major | K-b1 A + K-b2 Yes -> returning player WINs ~90 s into a run; box-0 cards count as covered | ACCEPT | K-b1 A coverage = per-card saved flag "latest scored encounter passed the D4 predicate" (any run, graded or Overtime), cleared by a later fail; window opens no earlier than the end of this run's graded waves |
| E-SEC2-3 | security-data | major | Cross-run "seen" = exposure, not mastery; ask hides it | ACCEPT (dup COR2-2) | Same definition, stated in the K-b1 option text |
| E-SIM2-4 | simplicity | minor | Derive cross-run "seen" from existing D5 Leitner records; drop "one saved fact per card" | REJECT | Leitner box diverges from "latest encounter clean": Overtime makes 0 Leitner writes (D19) and the daily grade lock blocks a same-day demote after a promote, so a card failed today keeps box >= 1. One saved yes/no per card stays, and stays in the Why not |
| E-AA2-2 | assumption | major | Recommended package never simulated; K-b1 A unmodelled; window start under A undefined | ACCEPT | Simulated (out4): K-b1 A multi-run, expert 20 cards WIN in run 1 (median), 90%-learner 20 cards run 2 (p90 4), expert 90 cards run 3 (p90 4), 500 cards run 15 (p90 16), runs ~7-12.5 min, 0 WINs with an unknown card. Window start under A defined (COR2-2). Asks quote shipped-combo rows |
| E-AA2-1 | assumption | critical | Fix (ii) "shown = answered" rewrites Kev's Q11 word "shown" but is agent-filled; its cost billed to K-b2 | ACCEPT (ask); PARTLY REJECT (cost claim) | (ii) becomes Kev ask K-b3. Re-run with the D4 predicate and D4 re-queue in both arms (out4): (ii) costs ~0.3 pts (expert 87.6% -> 87.3%); the out2 gap (92.7% -> 81.5%) came from the old answer def, not (ii). K-b3 matters only if K-b1 is not A (A already needs a clean answer per card) |
| E-COR2-3 | correctness | major | K-b2 Why-not numbers (99 -> 84%, 8 -> 11 min) are a mixed row | ACCEPT finding; REJECT proposed figure (98.4 -> 92.7%) | 92.7% is the old plan def, not the shipped D4 predicate. Shipped-predicate K-b2 cost (out4): expert 98.2% -> 87.6%, 8.6 -> 10.5 min; noisy room 93.4% -> 67.1%; 60 s window recovers 91.7% / 86.0% (out5). Quoted in K-b2 |
| E-COR2-5 | correctness | major | "while charge = 5" + no charge cap -> 6th correct locks the ultimate out | ACCEPT | Write "charge >= 5" (matches sim L151); S7 "6th correct while charged -> ultimate still fires 1/1" |
| E-FM2-2 | failure-modes | major | Discarding in-flight transcript on pause erases a wrong answer | ACCEPT finding; REJECT its fix (grade speech ended before pause) | Grading needs the transcript, which conflicts with SEC2-5 (abort the upload). Merged fix below (SEC2-2) |
| E-SEC2-2 | security-data | major | Pause = free undo of a regretted guess; corrupts Leitner + window | ACCEPT | Pause during an open answer window = D4 "Voice miss" row (no hit; encounter can no longer promote; counts toward the 2-attempt orb trigger; not clean for WIN). Reuses an existing outcome, no new state. S6 "pause mid-window then correct retry -> 0 promotes, encounter not clean 3/3" |
| E-SEC2-5 | security-data | minor | Discard is client-side; audio already streamed to Wit stays in its log | ACCEPT | Pause aborts the in-flight Wit request. Residual named: audio sent during the 0.5 s debounce may already be in Wit's log until the Dec 11 purge (privacy page already discloses bystander speech). S6 case |
| E-SIM2-1 | simplicity | major | K-a recommended = two detectors (palm gate + trigger chord); A+X simpler; D16 carve-out dead code | ACCEPT | Recommended flips: hands = two-palm push (D7 today), controllers = press A+X together (no controller motion detector). Handoff candidate (triggers + push) stays option 2 (must-keep). D16 carve-out deleted: the intro runs on first launch before combat, charge = 0 |
| E-FM2-3 | failure-modes | major | Blanket armed-state slash suppression eats slashes (trigger rest, palms-forward slash) | ACCEPT | Replace with a 0.3 s hold: while armed, a slash event waits <= 0.3 s and is dropped only if a push fires. Hands only under the recommended K-a (A+X needs no hold); both inputs if Kev picks option 2. S7 cases |
| E-AA2-5 | assumption | major | Trigger-chord gate assumes idle triggers; scripted S7 would not catch it | ACCEPT (dup FM2-3) | Same fix; option 2 adds S7 "charged slashing with both triggers held -> 20/20 slashes register" |
| E-SIM2-c2 | simplicity | hyp | Two-handed palms-forward slash at charge 5 dropped | ACCEPT (dup FM2-3) | 0.3 s hold; S7 "charged, palms forward, one-hand slash -> registers 3/3" |
| E-AA2-4 | assumption | major | C1 removes the plan's only cheat sheet; FLOW-065 needs one; budget uncounted | ACCEPT | Old sheet moves to ledgers; a new 3-bullet sheet (each <= 150 chars) replaces it in place; counted in the remeasured budget |
| E-SIM2-3 | simplicity | major | Same as AA2-4 | ACCEPT (dup) | Same |
| E-COR2-s1 | correctness | minor | Budget leaves out the new plan cheat sheet | ACCEPT (dup AA2-4) | Budget remeasured with block line counts; margin ~3, so a scratch-copy dry run gates the real edits |
| E-SIM2-c3 | simplicity | hyp | Step 3 ">= 35" only adds up if the Open-questions heading moves | ACCEPT | Replaced by measured block ranges (C4 = L451-470, L473-474, L478-483 = 28 lines); heading L448 and L450 stay |
| E-SIM2-5 | simplicity | minor | Table rows dodge the 150-char rule; rewrap L491/L500 instead | ACCEPT | Old sheet moves as prose, L491 and L500 rewrapped; CRITERIA = word-identical via `check_doc_content_covered.py` |
| E-SEC2-4 | security-data | minor | Nothing checks moved text arrived in the ledgers | ACCEPT | Step 2 CRITERIA: removed plan lines (scratch file) vs ledgers, `check_doc_content_covered.py` exit 0 and shingle coverage 100% |
| E-FM2-5 | failure-modes | minor | 33 lines cite moved Q IDs -> "0 dangling" uncountable; ledgers L2 false; solo_ff_merge missing branch | ACCEPT | Criterion: every Q/ENGINE/D15/D19/G0a/G0b ID cited in the plan resolves to one bullet in plan Open questions or ledgers "Resolved decisions" (cited-ID count = resolved count); ledgers L2 reworded; step 5 = `solo_ff_merge.py <branch> --repo <game primary>` |
| E-COR2-s2 | correctness | minor | S7 L316 "two-palm push" and S6 L382 "hands hidden -> 0 hits" not in edit list | ACCEPT | Both in the step-4 edit list (L316 -> "two-palm push or A+X"; L382 clause replaced by the freeze cases) |
| E-AA2-c2 | assumption | minor | Same L382 conflict | ACCEPT (dup) | Same |
| E-COR2-s3 | correctness | minor | L147 "baseline resets on ... resume, pause" needs an explicit edit | ACCEPT | L147 rewritten in full (step 4 text below); old reset clause replaced by the fresh-baseline rule |
| E-AA2-c1 | assumption | minor | K-b1 stem "can never win" contradicts 90 cards WIN 66.0% at 39.2 min | ACCEPT | Stem restated: 90 cards win ~2 in 3 single runs at ~39 min median; only 500 cards cannot finish in one run |
| E-AA2-c3 | assumption | minor | v1 HE exclusion differs from today's D19 (per answer) and the sim | ACCEPT (named) | Whole-encounter exclusion kept (an HE encounter always ends in an assisted orb, which the D4 predicate scores not clean, so per-answer counting would fail the player for a system fault); difference stated in D19 text |
| E-SEC2-c2 | security-data | minor | PB not moot: one int across Endless, all-decks, 12-card runs | ACCEPT (was DEFER SEC-x) | PB keyed per (mode, selection) in the D5 save; in-place D19 L258 edit |
| E-COR2-simp | correctness | simplicity | One per-encounter predicate for "shown" and "counted" | ACCEPT | One per-encounter result: clean / not clean / excluded (HE) / ultimate. Shown = clean or not clean; window counts clean vs not clean; misses = not clean or ultimate |

Round-1 verdicts changed by round 2: FM-1 fix (replay every resume -> once, fresh baseline, all interruptions); SEC-2 (cap still
rejected, premise now true); SEC-1 (discard -> Voice miss + Wit abort); FM-2 (blanket suppression -> 0.3 s hold); AA-5/COR-x
(trigger chord -> A+X recommended, chord kept as option 2); SEC-x (DEFER -> ACCEPT); FM-5 (table rows -> rewrap); SIM-2/C1 (no
replacement sheet -> replace in place); (ii) agent-filled -> Kev ask K-b3; budget table remeasured. All other round-1 rows stand.

## Ledger (eval finisher)
| ID | Sev | Finding | Change in v2 |
|---|---|---|---|
| E-FIN-1 | critical | v1-r2 makes ANY pause mid-answer a Voice miss; hands drop out of view while speaking (lap), so honest answers become misses and WIN dies | Input-loss pause freezes attack timers only, never touches the mic or answer window; only a system/menu pause (app loses focus, D2 loses the mic) affects an answer |
| E-FIN-2 | major | Voice-miss-on-pause still undoes a regretted wrong guess (box unchanged instead of box 0, no pip) | Menu pause after speech start = graded Voice wrong for Leitner and the orb trigger, no hit (D7 "no hit while paused"); before speech start = Didn't catch. Residual: a Meta-button press mid-sentence demotes that card |
| E-FIN-3 | major | Replay-once silent on menu pause or recenter DURING the replay; recenter moves the tracking origin, so the old baseline auto-dodges or false-hits | Menu pause/recenter during a replay: freeze, re-take baseline, resume the remaining telegraph, no second replay. S6 case |
| E-FIN-4 | minor | Overlapping attacks (D7 shared baseline) not covered by the replay rule | One fresh shared baseline; each frozen attack replays once. S6 case |
| E-FIN-5 | major | "Clean" = L116 voice predicate excludes silent-mode first-pick orbs (D4 L122 promotes), so silent players (M10) can never WIN | Clean = first scored attempt would promote under D4 (voice or silent first pick), computed not written. S2 case |
| E-FIN-6 | major | Mixed input (one controller + one hand) fires neither ultimate mapping, breaking M4 | Hold the held controller's A or X 0.5 s. S7 case gated on SIG-1, now load-bearing |
| E-FIN-7 | major | No K-a option is the handoff candidate verbatim (pause on controller loss too + triggers/push); v1-r2 option 3 had no ultimate | K-a options: recommended; handoff candidate verbatim; union pause + triggers/push. Shared guards moved to the stem |
| E-FIN-8 | major | Window start undefined under K-b2 No; "armed" undefined (every charged slash would lag 0.3 s) | Window start = latest of run start, coverage (K-b2 Yes), graded-waves end (K-b1 A). Armed = charged with both palms facing forward |
| E-FIN-9 | major | Dry run in a scratch copy is vacuous: the hook exempts Temp/scratchpad paths | Dry-run step deleted; the live hook on the real worktree path is the gate, removals first; a denied growth edit -> overflow order, else STOP |
| E-FIN-10 | major | "Shingle coverage 100%" cannot pass: rewrapped L491/L500 drop shingles and the tool treats shingles as advisory | CRITERIA = exit 0 (0 lost identifiers) + uncovered-shingle % recorded and spot-checked |
| E-FIN-11 | major | L147 "rewritten in full (step 4 text below)" but no text existed; budget was estimates (margin ~3) | Draft text below; measured costs +39 vs freed 49, re-added 8 -> plan ~498. ALL resolved bullets move (simpler rule, +5 freed) |
| E-FIN-12 | minor | `<branch>`, `<game primary>`, "game worktree" unresolved; eval ledgers live only in Temp | Concrete paths in steps; ledgers file gets this eval's ACCEPT/REJECT rows (table rows) |
| E-FIN-13 | minor | K-b3 asked even when K-b1 A makes it moot; the unanswered rule then forces a pointless re-ask | K-b3 recorded "moot under K-b1 A", no re-ask. A free-text answer gets its own adversary pass before any write |
| E-FIN-14 | minor | K-b1 option 2 (pips regrow) touches Kev's Q8 "5 pips fixed" unstated; moved Q11/Q12 bullets go stale after answers | Why not names Q8; moved Q11/Q12 bullets get "amended by K-b1..K-b3 / K-a 2026-10-28" |
| E-FIN-15 | minor | Lingering doubt (sim params) has no decision rule; S9 "reachable 1/1" is one sample | S9: 3 starter-deck runs, time-to-WIN recorded 3/3; 0/3 WIN or median >15 min -> window 60 s and re-run |
| E-FIN-16 | minor | Stale README input line + test command; plan L10 "(see Open questions)" after the move; D17 ghost demo hands-only | README commit (separate); L10 "(see Open questions + ledgers)"; D17 ghost demo shows the player's input |

## Ledger (eval main thread + Kev answers 2026-10-28)
| ID | Lens | Sev | Finding (short) | Verdict | Reason / change |
|---|---|---|---|---|---|
| E-N1 | main thread | major | Under K-b1 A, Overtime "not yet shown this run" must serve not-yet-covered cards first (90 cards: 6 runs vs 3) | ACCEPT, then superseded | **Superseded by** the FSRS pass (E-FS-6): D14 filler order makes uncovered-first intrinsic |
| E-N2 | main thread | minor | S2 "1 answer after a 90 s pause -> no WIN" must put a not-clean encounter in the 90 s of play before the pause, else it is a correct WIN | ACCEPT | S2 CRITERIA wording |
| E-N3 | main thread | stated | First run (D14: 6 cards, no Overtime) can never WIN | NO CHANGE | Stated only |
| E-N4 | main thread | third option | Grade what was heard: on a menu pause close the mic, let the in-flight Wit request finish, grade its final transcript; Voice wrong only if none arrives in 3 s | DEFER (device check) | Adopt only if an S9 device check passes: "menu mid-speech: final transcript arrives 3/3". Open device question: does a Wit request finish while the Quest system menu is open? Not plan text |
| E-N5 | main thread | third option | Score an orb pick right after a Hard STT error like a silent-mode first pick | REJECT | Wi-Fi-off 90%-knower WIN 0.0% -> 27.1%, 154/1000 wins while not knowing a card; exclusion stays; silent mode is the honest route |
| E-K-a | Kev | answer | D7 controllers | ACCEPT | Kev: "Any input pauses (Recommended)" = plan-v2 D7 text |
| E-K-b1 | Kev | answer | Big decks: count across runs | SUPERSEDED | Kev: "it should be following fsrs principles (so we can do something similar to anki where we set the number of cards for a day)". **Superseded by** E-FS-1/E-FS-5/E-FS-7 (FSRS daily queue + two-tier WIN) |
| E-K-b2 | Kev | answer | Stretch only after coverage | ACCEPT (Yes) | Kev: "#1 - yeah otherwise user can cheese it and dodge for 1-2 minutes after doing one correct" |
| E-K-b3 | Kev | answer | Ultimate-wiped cards count as shown? | SUPERSEDED | Kev: "ultimates can push cards further away, so yuo have more time to answer it". **Superseded by** E-FS-8 (knockback never removes cards) |
| E-K-c | Kev | answer | D1 engine: IWSDK for prototyping? (2026-10-28/29) | ACCEPT (dual-track) | Kev: "would immersive web sdk be better for prototyping the idea, and hten we port to unreal if needed? I saw in https://www.youtube.com/watch?v=D04z9PYUSao felix is able to generate a full trailer and game in 45 minutes with immersive web sdk"; "you know what, cant we just do both? if iwsdk is going to take 45 minutes to set up, we can learn how iwsdk works while also progressing on UE build in paralell"; "and then they can both exist in the project, and we can have in the readme which one we prefer judges to try"; "or we can have iwsdk buildi n a separate repo to help with parallelism"; "and the main repo that we currently have is unreal". -> D1: this repo = Unreal; IWSDK build in sibling repo game-iwsdk; a device spike picks which build to submit **Superseded by** E-D1-1 (only one link is judged; the README does not choose); SP3/Q10 overtaken (MV-7) |
| E-IW | research | premises | IWSDK (WebXR) premises, researched 2026-10-29 | ACCEPT (input to D1; UNVERIFIED items gate the README pick) | Eligibility: hackathon.md:73-74 and rules.md:137-140 accept IWSDK (WebXR) by hosted URL (GitHub Pages or Vercel etc.); guidelines.md:53 engine-neutral prizes; guidelines.md:111 "a URL for web experiences". SDK: MIT, ECS on a Three.js fork (super-three 0.185.0) https://github.com/facebook/immersive-web-sdk ; @iwsdk/core latest = 1.1.0-rc.2 (2026-10-23), 1.0.1 2026-10-01 https://registry.npmjs.org/@iwsdk/core . Agent tooling (IWER emulation, CLI, screenshots, ECS step/snapshot) https://iwsdk.dev/skill.md . Cloud-STT CORS check (2026-10-29) moot: Wit dropped (V-1). UNVERIFIED, needs the device spike: getUserMedia mic inside an immersive session (no Meta doc; mitigation: request before requestSession); Quest 2 hand tracking in Quest Browser (palm pinch system-reserved) https://developers.meta.com/horizon/documentation/web/webxr-hands/ ; offline persistence (navigator.storage.persist()) https://web.dev/articles/storage-for-the-web ; >=60 fps on Quest 2 https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/ ; hands-first scoring parity for web (rules.md:223). ts-fsrs 6.0.0 MIT https://registry.npmjs.org/ts-fsrs : FSRS-6 21 weights + fuzz-off UNVERIFIED. Video https://www.youtube.com/watch?v=D04z9PYUSao : IWSDK tech lead builds an MR tower-defense game in ~42 min; no evidence for voice, FSRS, Quest 2 fps. Port-later: no code ports (decks, FSRS vectors, relay, matcher spec do) |
| E-K-d | Kev | answer | Quest 3S compatibility (2026-10-28) | ACCEPT | Kev: "yes add the 3S compat decision to the plan" -> D20: Quest 2 baseline, Quest 3S compatible, one APK; each 3S rule cites a URL or says UNVERIFIED |
| E-K-e | Kev | answer | FSRS pass asks: WIN scope, daily limits, ratings (2026-10-28) | ACCEPT | Kev: "Two tiers (Recommended)"; "12 new / 120 reviews (Recommended)"; "Again / Hard / Good (Recommended)" -> D19 two-tier WIN (E-FS-7), D5 budget (E-FS-5), D4/D5 rating map (E-FS-2) |
| E-D1-1 | main thread | major | The derived clause in E-K-c (a device spike picks a build to recommend in the README) assumes both builds reach judges; rules.md:56 allows one Entry per person and rules.md:140 takes ONE Devpost link: the Competition-channel link (APK) OR the GitHub page (IWSDK/WebXR) | SUPERSEDED (2026-10-31, verified rules.md:56,140) | D1: the IWSDK device spike plus the UE spike (SP1/SP2) decide WHICH BUILD IS JUDGED at G1 (Nov 3); the README cannot offer a choice. Kev's verbatim E-K-c quote about the README is unchanged; the Devpost-form open question is answered (no) |
| E-D1-2 | main thread | major | Conflict: the IWSDK build ships voice OFF by default (D2), so if it is the judged build it ships without M9 (speech recognition in headset) | LOGGED (open) | Not yet resolved; weigh at G1 (Nov 3) when choosing the judged build (D1) |

## Ledger (FSRS pass: 3 Opus adversaries, correctness / simplicity-cost / assumption-audit, synthesized)
| ID | Lens | Sev | Finding (short) | Verdict | Reason / change |
|---|---|---|---|---|---|
| E-FS-1 | synthesis | major | SR algorithm for big decks + daily limits (Kev: FSRS, Anki-style cards per day) | ACCEPT | D5: FSRS-6, 21 default weights, retention 0.90, no optimizer, fuzz OFF (D18 determinism), no learning steps, interval = clamp(round(S),1,365) whole study days; hand-ported engine-free C++ Core module from py-fsrs (MIT, CREDITS); golden vectors from a pinned py-fsrs script under tests/fixtures (own test + README entry). Leitner and study-ahead retired. REJECT rs-fsrs-c (Rust FFI PoC -> cargo + NDK in the UE build), xiety/fsrs (unvetted) |
| E-FS-2 | synthesis | major | Map game outcomes to FSRS ratings | ACCEPT | Again / Hard / Good only (Kev); Easy never emitted (Wit latency confounds speed). One write per encounter; Hard-STT-only and Didn't-catch-only encounters write nothing; unresolved at run end = Again if orbs were shown, else no write |
| E-FS-3 | synthesis | major | Daily grade lock under FSRS | ACCEPT (kept) | Max 1 FSRS write per card per study day, queue cards only; Overtime misses-first = ungraded relearn |
| E-FS-4 | synthesis | minor | UTC-day rollover lands mid-evening PT | ACCEPT | Study day = local 04:00 rollover (Anki-style); run_day frozen at run start |
| E-FS-5 | synthesis | major | Daily budget can be multiplied by switching decks | ACCEPT | Global counters {new_today, reviews_today} across selections; limits default 12 new / 120 reviews (Kev), S9 steppers, edits apply next study day; queue snapshot per {run_day, selection hash} |
| E-FS-6 | synthesis | major | Run size vs today's queue; fillers must not spend budget | ACCEPT | D14 reserves min(12, uncovered queue); fillers ungraded (graded today, lapses first; then introduced not-due by lowest R; never New); same order in D19 Overtime; supersedes E-N1; study-ahead removed (would overrun budget) |
| E-FS-7 | synthesis | major | WIN scope under a daily queue (Kev: two tiers) | ACCEPT | Tier 1 Day cleared, Tier 2 Deck conquered (M24 literal); both: coverage, then >=90 s unpaused, >=4 counted encounters, all clean, all after coverage (Kev #1); empty queue = practice run (no WIN); dissolves E-K-b1 and E-K-b3 |
| E-FS-8 | synthesis | major | Ultimate-removed cards break coverage and grading (Kev: push cards away) | ACCEPT | D4 knockback: pushes the strike-slot enemy back toward its wall spawn, cancels its in-flight attack (only allowed cancel), resets its telegraph; never removes or grades cards |
| E-FS-R | synthesis | residual | Residual cons named | ACCEPT (named) | FSRS float pow/exp x86 vs ARM drift (UNVERIFIED; tolerance + on-device vectors); no same-day relearn write (Anki calls empty steps experimental); orb 1-in-4 guess rated Hard/Good can overstate stability; no voice WIN while Wit is down (silent mode works); knockback never shortens a boss wave; 21 untuned weights; clock tampering accepted (single-player); local-04:00 boundary pair 03:59/04:01 |
| E-FS-9 | synthesis | superseded | Plan-v2 WIN-floor CRITERIA "card last answered wrong -> not covered 1/1" and "returning player: no WIN before graded waves end + 90 s 1/1" (both written for K-b1 A cross-run coverage), and "ultimate-removed card -> re-queued 1/1" | SUPERSEDED (re-homed here 2026-10-29, not deleted) | **Superseded by** the two-tier WIN (Kev "Two tiers (Recommended)", E-FS-7, E-K-e): coverage is per study day (Tier 1, last_review_day == run_day, so a card answered wrong today is covered) or per run (Tier 2), never a cross-run saved flag, and the window opens at coverage, not at the end of graded waves. Ultimate-removed: **Superseded by** E-FS-8 (knockback removes 0 cards). Remaining WIN-floor cases kept in plan S2 |

## Moved from the plan 2026-10-29 (B1, B2)
Verbatim except rewrapping and the MV-5 amendment; the plan keeps a pointer citing each MV ID.
- MV-1 Plan header (after the Kev decisions line):
  Changes from v1: see Ledger (finisher), then Ledger (adversary round 2), then round 1, in
  [2026-10-28-vr-flashcard-game-ledgers.md](2026-10-28-vr-flashcard-game-ledgers.md). Sources re-checked in the primary checkout for
  this pass: rules.md:88-143,154-168,195-239,318-330; guidelines.md:44-62,102-112; hackathon.md:63-75.
- MV-2 D18 unverified premises (plan D18, before D19):
  Unverified premises (docs-checked 2026-10-28; SP1/Nov 2 spike checks, each with a fallback): (1) UE 5.8 + Meta XR Simulator
    compatibility not stated in Meta docs; check the Meta XR plugin release notes; fallback T1 without the simulator (flat-screen
    pawn) + T2 on device. (2) Simulator replay has no CLI: a `session_capture` block in
    %APPDATA%/MetaXR/MetaXrSimulator/persistent_data.json (exec_state=replay, quit_when_complete) drives it, removed after each run;
    the app must exit on the OpenXR session-exit request; .vrs record/replay verified, hand-tracking recording undocumented;
    fallback scenarios driven by the debug input layer only. (3) Synthetic environments supplying MRUK scene data is inferred, not
    documented; fallback T1 covers the D8 ring fallback, wall spawns on T2/S8. (4) Simulator hand tracking exists only on some
    device profiles; fallback debug slash/dodge/ultimate commands, hand feel at Kev's check-ins. (5) Proximity bypass unverified on
    Quest 2, may reset on sleep/reboot; fallback Kev starts T2 runs in person. (6) OVR Metrics CSV pull worked on Quest 2 per a
    forum report, package name needs re-checking; fallback fps from the event-log frame time. Sources:
    developers.meta.com/horizon/documentation/unreal/xrsim-intro/,
    developers.meta.com/horizon/documentation/unreal/xrsim-session-capture/, dev.epicgames.com Gauntlet docs,
    communityforums.atmeta.com proximity thread.
- MV-3 D18 premises SIGNALS (plan External signals):
  D18 premises (SP1/Nov 2 spike): Meta XR plugin release notes state UE 5.8 + simulator support; a simulator session_capture replay
  run exits cleanly; a synthetic room returns MRUK scene data; simulator hand tracking on the chosen device profile; Quest 2
  proximity bypass holds for a full run; OVR Metrics CSV pulled over adb (package name re-checked).
- MV-4 A4 residuals (plan A4; judges play Quest 3/3S, each gap logged residual risk, not a blocker):
  A4-R1 perf: 3/3S (newer SoC) expected faster than Quest 2, so Quest 2 fps is the conservative bound, but 3/3S fps is unmeasured.
  A4-R2 scene: Quest 2 greyscale passthrough + manual Space Setup vs 3/3S colour passthrough + their own Space Setup; judge-room MRUK
    spawns are unverified (A5, S8).
  A4-R3 FoV: Quest 2 FoV differs from both 3S (~96 deg) and 3 (~110 deg) (A12); D8 arc-edge readability on judge FoV is unverified (S11).
  A4-R4 footage: no 3/3S colour-passthrough capture path; SP1 capture fallback is XR Simulator room footage only (D12).
- MV-5 Rejected alternatives (plan section):
  Web Speech API (R15,R20). LLM grading (nondeterministic, injectable). SM-2 (over-built). Leitner 5-box (superseded by FSRS-6 in D5, E-FS-1;
  amended 2026-10-29: FSRS moved out of this list). Reusing realm-of-recall/MemriPal (R19). Multiplayer. Muse relay (needs live server+key).
  Palm-shield assist (collides with two-palm ultimate). VR arena (unscheduled, rules.md:215). n-best matching + number-word conversion (false-accept
  bias, aliases suffice). Page-issues-code relay (needs VR text entry). Hand-rolled per-IP KV counter + GET rate limit (quota drain, unneeded given
  code space). Device kill-mid-write test (nondeterministic). One-way silent-mode latch on STT error. Server-side code patches during the freeze
  (rules.md:168).
- MV-6 D5 before the FSRS rewrite (Leitner superseded by E-FS-1; JsonUtility / Game.Json adapter = Unity fallback only):
  D5 SR = Leitner 5 boxes (0,1,3,7,14 d), due dates as UTC calendar days; box = enemy armor tier (visual only: armor look per box, no mechanical
  effect); grading per D4. Card ID = lowercase hex of the first 16 bytes of SHA-256 over UTF-8 of (NFC, trimmed, whitespace-collapsed front + U+001F
  + back) (never string.GetHashCode; no punctuation strip, so "5-3" != "53"); parser keeps the first of any duplicate ID and reports the count;
  editing a card's text makes it a new card by design. Empty due queue -> study-ahead: spawn lowest box, earliest next-due first. Save = JSON in
  persistentDataPath: write temp + flush; if primary missing -> File.Move(temp, primary), else File.Replace(temp, primary, .bak); load order primary
  -> .bak -> fresh state. Deck parser on device = JsonUtility (no polymorphic deserialization). JsonUtility is UnityEngine, so it lives in a thin
  Game.Json adapter asmdef that maps to plain DTOs; all validation (caps, required non-empty fields, >=4 distinct answers, duplicate IDs) lives in
  Core (noEngineReferences, S1). Deck schema root is an object {"version":1,"title":...,"cards":[{"front","back","aliases":[],"reject":[]}]} because
  JsonUtility cannot parse a top-level array and silently defaults missing fields; Core rejects defaulted/empty required fields.
  Under Unreal (2026-10-28): the JsonUtility / Game.Json adapter workaround is N/A (C++ parser in Core); kept for the Unity fallback.
  Every Leitner write (D4 grading, study-ahead included) obeys the D19 daily grade lock.
- MV-7 SP3 (IWSDK + vosk-browser, HELD, Q10): overtaken by D1 dual-track (Kev 2026-10-29; E-K-c, E-IW). Plan text:
  D1: IWSDK + vosk-browser = SP3, HELD (Q10): last resort if both engines fail G1; if SP3 wins G1, S-slices are re-planned Nov 4 and hosting is
    GitHub Pages from the PUBLIC repo (rules.md:140, guidelines.md:60 name a GitHub page; free because the repo is public, A6), which satisfies
    M20's rationale; if the repo is still private at that point, hosting is Vercel free tier per M20 (rules.md:138 allows it).
  Slices: SP3 HELD (Q10, 2026-10-28; not scheduled): IWSDK + vosk-browser, GitHub Pages hosting. Last-resort fallback, run only if both the UE spike
    and the Unity 6.3 LTS fallback fail G1.
  G1: SP3 only if both engines fail (Q10).
  SIGNALS: SP3 GitHub Pages/Vercel URL loads on Quest Browser.

MV-8 D4 table before the FSRS column and knockback ultimate (E-FS-2, E-FS-8):
D4 Answer outcomes (single table; "encounter" = one card-enemy's card until it is removed; the FIRST scored attempt (correct or wrong) of an
  encounter sets its Leitner grade):

| Outcome | Classified when | Enemy | Player | Leitner |
|---|---|---|---|---|
| Voice correct | D3 correct | -1 card | none | promote +1 only if first scored attempt and no prior miss/orb this encounter; else unchanged |
| Voice wrong | D3 wrong | none | hit | demote to box 0 if first scored attempt; else unchanged |
| Voice miss | non-empty, not correct/wrong (ratio, margin, prefix, length fails) | none | none | encounter can no longer promote; counts toward 2-attempt orb trigger |
| Didn't catch | empty transcript or 6 s cap | none | none | none; counts toward 2-attempt orb trigger |
| Hard STT error | error callback, HTTP 429, or no final transcript 3 s after end of speech | none | none | none; orbs immediately for THIS card only; next card tries voice again |
| Orb correct (voice mode, after misses/errors) | slash correct orb | -1 card | none | unchanged (assisted) |
| Orb correct (silent mode, first pick) | slash correct orb | -1 card | none | promote +1 |
| Orb wrong | slash distractor | none | hit | demote to box 0 if first scored attempt; picked orb removed |
| Ultimate | ultimate hits enemy | removes cards from pool | none | none; removed cards stay due and re-queue |

Ultimate charge: +1 per correct outcome (voice or orb, assisted or not); firing the ultimate resets charge to 0; ultimate kills do not add charge.

- MV-9 D18 Selection + Enforcement (plan D18, before Reusable suite):
  Selection (M23; restates rules.global/full-suite-only-when-deterministically-required.md, whose paths: cover agent-workflow only, so
    nothing enforces it here): every tier is affected-only by default; no flag, script option or default offers an opt-in full run.
    Each test/scenario declares mechanic tags (slash, layers, answer, orbs, dodge, ultimate, cues, spawn, waves, overtime, win,
    endless, ...); a checked-in path-to-tag map (source dirs/assets -> tags) + `git diff <base>` picks them. A path the map lacks
    goes through a deterministic reference scan (class/asset path, module name, literal path): tests referencing it are selected,
    0 references = 0 tests, NEVER a full-suite fallback; the missing map entry gets added. The full suite runs only when dependency
    resolution itself selects every test (e.g. a shared step helper every scenario uses). Bases: per commit = main; slice close =
    slice start commit (the affected set for the slice's whole diff is green); T2 = last T2 sha (affected scenarios + the fps check).
    Pattern only: agent-workflow scripts/affected_tests.py (OPS-438, OPS-680; pytest-centric, cannot select UE tests).
  Enforcement (deterministic, not prose; M23): (1) one runner script (scripts/, own test + README entry) is the ONLY entry point for
    every tier; it computes the selection from `git diff <base>` itself, takes no test-name/filter/"all" argument, exits non-zero
    with no base and on any failure. (2) A repo-level Claude Code PreToolUse Bash hook in the game repo's `.claude/` denies direct
    engine test calls that skip the runner (`UnrealEditor-Cmd ... Automation RunTests`, `RunUAT ... RunUnreal`/Gauntlet; Unity
    fallback `-runTests`), naming the runner in the deny reason. (3) Every run prints and logs the selected count, a per-test reason
    (map tag / reference hit / dependency) and wall time; a whole-suite selection prints the deterministic reason that pulled in
    every test, so "why did everything run" always has a logged answer. (4) Selector regression tests. Each is an S1 CRITERIA line.
- MV-10 Kev-only manual actions (plan section):
  Devpost Join Hackathon (+ check for a judges-only invite-URL field); forum Start Member flair; workshop/office-hour dates; Meta
  dashboard org/app/Competition channel/privacy URL (SP1-SP2); release keystore + 2 backups (SP1); non-org Meta account for invite test
  (SP1); private GitHub remote + CI gitleaks (now), public flip at G1 (Q2); second speaker
  for SP2 (Q6: TTS voices); UE 5.8 (5.7.4 only on fallback, A2) + Android NDK r27c + JDK (Unity 6.3 LTS + Android module only on fallback); backup Meta dashboard
  app (Q7); Vercel account + Upstash integration; new YouTube channel for the game (Q1); cleared room for capture (D12); privacy
  deletion contact address; Quest 3/3S access dropped (A4 waiver 2026-10-28: Quest 2 only); 2 fresh S9 testers (Nov 13); content
  rating choice (S13, target 10+); Devpost tagline + division field + description + testing instructions sign-off (S13); pre-ruling
  email dropped (G0a); log every judging-period op with timestamp + reason (G0b); after Dec 11
  purge Upstash keys; 3 VR check-ins (D18): after the Nov 2 spike, once the core loop works, before submission.
- MV-11 FLAG for Kev (plan, after Kev-only manual actions; still open):
  FLAG for Kev: the D18 harness (runner, selector, bypass hook, debug input, event log) is folded into S1, making the Nov 5 AM slice
  heavy; D18 premises (2)-(6) carry agent-chosen fallbacks, not Kev-approved ones. Confirm or re-scope both.
- MV-12 D7 before B2 (superseded by plan-v2 D7, Kev E-K-a):
  D7 Dodge: baseline = mean head position over the 1.5 s before telegraph onset, FROZEN from onset until the attack resolves (overlapping attacks
  share the earliest frozen baseline until all resolve); the baseline rolls only outside attack windows. Dodge = lateral or downward displacement
  >=20 cm from the frozen baseline at the hit frame; forward lean ignored; all motion within 30 cm radius. Recenter or pause during an attack
  cancels that attack; baseline resets on recenter, resume, pause. Hand tracking lost (both hands) pauses attack timers and shows a "show your
  hands" prompt; no hit lands while paused. "Lateral or downward displacement" = Euclidean distance in the head-local lateral/vertical plane
  (forward axis dropped). Accessibility toggle: slower telegraphs + auto-dodge option. Ultimate = two-palm push.
- MV-13 D14 before B2 (superseded by E-FS-6):
  D14 Run loop (finisher-added; rules.md:126,128 "Satisfying in <=10 minutes", bus-stop test): a run = up to 12 due cards (study-ahead fills if
  fewer) packed into enemies of 1, 2 or 3 cards (M2), in due order, as D19 graded waves, then D19 Overtime. Player has 5 shield pips; a hit removes
  1, capped at 1 hit per encounter (Q8); the run ends at 0 pips, on WIN or on Retreat (D19; Endless only at 0 pips). First run = 6 cards, no-fail (0
  pips does not end it), no Overtime: it ends after its graded waves. Every run ends in the mastery screen; Leitner grades are saved per answer
  (D5), so an early end loses no progress. Target graded-phase length 4-8 min; Overtime and Endless are open-ended. Q8 (2026-10-28): counts (12
  cards, 5 pips) stay fixed; pacing (advance speed, attack cadence) is the tuning knob.
- MV-14 D19 before B2 (Leitner, UTC days, study-ahead, one-tier WIN; superseded by E-FS-3..E-FS-7):
  D19 Wave survival + win (Kev, 2026-10-28; M24, Q11, Q12): per round the player picks deck(s), incl. "all decks"; Endless is an explicit opt-in
  (default off). Graded waves = the D14 run cards (due, study-ahead fills), 3 cards per wave (12 -> 4 waves, 6 -> 2); pool size ramps 1 -> 2 -> 3
  (M2), attack cadence ramps, last graded wave = one 3-card boss. Overtime waves follow until 0 pips: tonight's misses first, then selected-deck
  cards not yet shown this run, then recycled seen cards; zero Leitner writes; each wave faster. WIN (checked after every answer; never in Endless):
  every card in the selected deck(s) shown this run (not-due cards served ungraded, no Leitner write) AND accuracy over the last 90 s of answers
  >=99% (window tuned 60-120 s in S9; answer = any D4 outcome except Hard STT error and Ultimate; under 100 answers in the window, 99% means 0
  non-correct). Endless ends only at 0 pips. Retreat any time -> mastery screen. Mastery screen: waves survived, personal best (int in the D5 save),
  next-due count worded "next uprising: N cards" (due dates are UTC days, so the count rolls at UTC midnight, not local midnight). Daily grade lock:
  max 1 Leitner write per card per UTC day; closes the study-ahead hole (D4 grades the first scored attempt per encounter and D5 study-ahead
  re-serves not-due cards, so repeat runs could walk one card box 0 -> 4 in a day). First run (D14) stays 6 cards, no-fail, no Overtime. Horde = the
  D13 wall queue. Wreckage = the D17 wall-crack persists and grows one tier per wave on MRUK wall planes; ring fallback (D8) = a barricade taking
  the same tiers; decal count capped, checked at S11 >=60 fps. Built: S2 packing + grade lock + Overtime + win check, S6 run end, S6a mastery fields
  + PB save, S8 wreckage + barricade, S9 deck select + Endless + Retreat + window tuning, S11 decal cap.
- MV-15 CRITERIA S2 + S6 + S7 before B2 (superseded by E-FS-1..E-FS-8, E-K-a, E-N2):
  S2 >=40 matcher golden cases, all run with EMPTY reject lists unless the case tests the reject list: >=10 generic near-miss rejects
  (afferent/efferent, hypertonic/hypotonic, exothermic/endothermic, Prussia/Russia, hypo/hyperthyroidism, "not X", "X or Y", answer "A", accented vs
  unaccented, shared-answer cards) + topic cases added after SP2; D4 table: 1 test per row (9/9) incl. wrong-then-orb-correct -> no promote,
  ultimate -> no grade change; 5 Leitner transitions + study-ahead when 0 due; >=8 malformed decks rejected (incl. <4 distinct answers); ID stable
  across reorder; "5-3" vs "53" distinct IDs; duplicate card -> 1 ID kept; 1 fixed SHA-256 ID golden value; top-level-array JSON and a card with a
  missing/empty front each rejected 2/2; normalize.json fixture N/N; orb trigger: wrong+miss, miss+didn't-catch, wrong+wrong each -> orbs 3/3;
  ultimate charge: orb correct counts 1/1, reset to 0 after firing 1/1, ultimate kills add 0 1/1; run loop: 12-card cap 1/1, pools only of size 1-3
  1/1, 5th hit ends run 1/1, grades saved before run end 1/1, 2nd hit in one encounter removes 0 pips 1/1, first run = 6 cards, not ended at 0 pips
  and no Overtime 1/1; D19: wave packing 12 -> 4 waves and 6 -> 2 2/2, last graded wave = one 3-card pool 1/1; grade lock: 2nd scored attempt on a
  card in one UTC day -> 0 Leitner writes 1/1; Overtime answers -> 0 Leitner writes 1/1; win check: 1 card unshown -> no WIN, window accuracy <99%
  -> no WIN, full coverage + >=99% over the window -> WIN, Endless -> no WIN 4/4; deck-lint (Q4): numeric answer rejected, 3-char answer flagged,
  homophone answer without alias flagged 3/3, 3 starter decks pass 3/3; `// Covers: FEAT-ID` above every [TestFixture].
  S6 3-card pool with no ultimate needs exactly 3 correct; dodge at >=20 cm lateral/down; lean at telegraph start held through a 2 s telegraph ->
  dodged 3/3; same with accessibility slow telegraph 3/3; slow 1 s lean -> dodged 3/3; 0 false dodges in 20 forward-lean slashes; recenter + resume
  then dodge correct 3/3; enemy outside +/-40 deg never starts a telegraph 3/3; hands hidden mid-telegraph -> 0 hits and prompt shown 3/3; telemetry
  over 1 full run: max head displacement from run start <=30 cm 1/1 and 100% of slash contacts <=0.65 m from the head.
  S7 ultimate at exactly 5; 0 ultimate triggers in 60 s of slashing; D15 toggle OFF -> second ultimate type never offered 1/1.

## Voice decision 2026-10-30 (V-1)
- V-1 Kev 2026-10-30 after a 3-adversary round, verbatim: "sherpa-onnx default (Recommended)". Plan D2, A3.
  On-device STT only; default sherpa-onnx grammar/keyword recognizer constrained to the card's expected answers, behind
  IAnswerRecognizer. Nov 2 spike also measures Whisper tiny.en q8_0 (Runtime Speech Recognizer, Fab, paid; 43.6 MB), promoted only if
  p50 end-of-speech-to-text <= 1000 ms AND p95 <= 1500 ms AND >= 90% match on Quest (brief: Quest 3; only Quest 2 in hand, A4).
  Neither passes -> silent orbs (no-mic path). IWSDK: voice OFF by default until getUserMedia inside an immersive session is proven;
  transformers.js Whisper only if WebGPU p50 <= 1500 ms.
  Wit.ai DROPPED entirely: wit.ai/terms 3.3.1 (effective 2023-12-22) grants Meta an irrevocable, sublicensable licence to use Your
  Content (incl. utterances) "for any business purpose in connection with operating, providing or improving the Services"; no
  retention period, deletion process or training opt-out. Also removes the public client token (A13), unknown per-app limits (A16),
  the 429 path, cloud outage during the freeze and the Dec 11 log purge. Meta Voice SDK (Unity fallback) is Wit cloud (recon R20).
  Risks: Whisper hallucinates on non-speech, 52.1% on 1 s clips, top output "thank you" (arXiv 2501.11378); a hallucinated word ->
  Voice miss/wrong, a hit + FSRS Again (D4). Concurrent speech inference on Quest 3S raised long frames 1.09% -> 26.94% at 72 fps avg,
  3-thread ceiling (neurips.cc/virtual/2026/162449); no Quest 2 benchmark. Open-source UE whisper plugin
  (gtreshchev/RuntimeSpeechRecognizer) archived 2025-02-23; Fab build unverified on source-built 5.8 + Android.
  Superseded: A11 premise, A13, A16, SP2 burst + Wit-app steps, SP2b, D10 Wit token, ADR 0002 freeze-resilience row, F Wit checks,
  S4 forced-429, Wit SIGNALS.
