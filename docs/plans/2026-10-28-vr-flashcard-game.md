# VR flashcard combat game: build plan (Meta VR Start 2026, Gaming / New Experience)
Date: 2026-10-28. Status: hardened by /super-plan (2 adversary rounds + finisher). Source: offload run vr-flashcard-superplan-20261028-075442.
GOAL: judged Quest 3/3S build (dev + test on Quest 2 only, A4 waiver; residuals A4-R1..R4); seated player slashes card-enemies by
  hand, answers by voice or silent orbs; live in "Competition" channel by Nov 18 12:00 PT, unchanged to ~Dec 11. Success = Devpost
  submitted + invite URL installs on a non-org account + >=60 fps on device (Quest 2; 3/3S unmeasured, A4-R1) + voice answer works
  after a fresh invite-URL install. Decision: stack at gate G1 (Nov 3, off the MemriPal Nov 4 deadline).
Out of scope: multiplayer, LLM grading, MemriPal or realm-of-recall code/assets (recon R19), VR (non-passthrough) arena,
  post-Dec-11 MemriPal import (separate branch, never the judged channel).
Facts: R1-R20 in [2026-10-28-vr-flashcard-recon.md](2026-10-28-vr-flashcard-recon.md).
Kev decisions 2026-10-28: ENGINE (Unreal 5.7, spike-gated; D1), Q1, Q2, Q4-Q10, G0a, G0b, new D15 (see Open questions).
Changes from v1: see Ledger (finisher), then Ledger (adversary round 2). Round-1 ledger carried below them unchanged. Sources re-checked in the primary checkout for this pass: rules.md:88-143,154-168,195-239,318-330; guidelines.md:44-62,102-112; hackathon.md:63-75.

## Must-keep (Kev verbatim asks; never defer/cut/descope without Kev's explicit ask)
M1 Enemies are flash cards; slash with hand, then say the answer aloud; correct = damage.
M2 Bigger enemies = multi-card health pools.
M3 Enemies attack; player dodges (lean/duck).
M4 Ultimates unlocked after N correct answers.
M5 Gaming track, New Experience division (G0a 2026-10-28: claim kept with D11 disclosure; Devpost division field final at S13).
M6 Hands-first; seated, 2 ft (design limit <=30 cm head/hand radius satisfies both rules.md:122 radius and guidelines.md:47 diameter readings); judged on Quest 3/3S; >=60 fps.
M7 Deadline Nov 18 12:00 PT; build live + unchanged to ~Dec 11.
M8 Full-time VR from Nov 5; before Nov 4 only spikes.
M9 Speech recognition in headset (Unreal: direct Wit.ai HTTP, sherpa-onnx offline fallback; Unity fallback: Meta Voice SDK; Web
  Speech API rejected per MemriPal ADR 0008).
M10 Silent mode (slash answer orbs) for bus-stop test + accessibility.
M11 Deck input: bundled starter decks + companion paste page with pairing code.
M12 Deterministic fuzzy answer matcher with aliases; no LLM grading.
M13 Engine choice Unreal (spike-gated) vs Unity fallback evaluated (ADR 0001; Kev sign-off 2026-10-28; D1).
M14 Spaced repetition (Best Reason to Come Back).
M15 Purposeful passthrough: enemies emerge from real walls via MRUK.
M16 Separate from MemriPal; no shared code. Post-Dec-11 MemriPal cards on a separate branch.
M17 MIT license; credit GitHub KevinKbyte / "Kev" only; never link the YouTube channel.
M18 CREDITS.md for every asset from day 1 (sponsor may demand license proof); starter decks own/public-domain/CC only; Meta SDKs keep their own license, never vendored; Meta gets the judging/promo license only (guidelines.md:44; rules.md:342 wording is broader, recon R13).
M19 Privacy policy (required for a mic/camera app).
M20 Hosting: Vercel/Netlify free tier if web (GitHub Pages from a private repo needs a paid plan). Reconciled with D1 in FIN-3.
M21 Post-Dec-11: integrate MemriPal cards (separate branch, never the judged channel; see M16).
Scope constraint ladder (fidelity, not features) if behind at the Nov 12 checkpoint: 2 starter decks instead of 3 (floor 2: M11 says
  "decks", plural; cut Basic Science first, Q4); D15 experimental features cut (base build already has 1 ultimate type fired repeatedly, Q9);
  placeholder VFX/audio; mastery screen as text list; tutorial as 3 prompts; imported-deck list capped at 1 slot (still with delete
  confirm + Undo). Never drop an M-item.

## Assumptions
A1 Before Nov 5 only spikes, no game code. Honest budget: ~14 h Kev time Oct 28-Nov 3 (SP1 ~7 h, SP2 ~5 h, G0/G1 + 3 ADRs ~2 h); MemriPal has priority. Overflow rule: G1 takes its default (see G1) and any unfinished SP1 step runs Nov 5 AM before S1.
A2 Unreal Engine 5.7 + Meta XR plugins v207 (ISDK Unreal v207 lists UE 5.8/5.7; plugins built for 5.7; Meta has an open
  investigation into them failing to load on 5.8:
  developers.meta.com/horizon/feedback/vr/investigations/1053459897316880/), never vendored; MetaXRPlatform plugin OFF (crash report).
  Setup gaps: install UE 5.7, Android NDK r27c (26.3/27.0 present; SDK platforms 34-36 + build-tools 35.0.1 present), JDK. Unity
  fallback: Unity 6.3 LTS (6.2 out of support; AIO v207 min 6000.0.66f2) + Meta XR All-in-One at the version hackathon.md:63 names
  ("v81+ (v207)"), via UPM registry, never vendored; Android module installable (R18: missing). Resolved plugin/SDK versions recorded in
  ADR 0001 and checked in S1.
A3 Wit.ai cloud (Unreal: direct HTTP, since voicesdk-unreal is archived, last push 2025-06-03, verified 2026-10-28; Unity fallback:
  Meta Voice SDK) p95 <=1.5 s end-of-speech -> transcript for 1-4 word answers on Quest (unverified; SP2 measures). Wit per-app rate
  limits unverified; SP2 records the published figures in ADR 0002.
A4 WAIVED 2026-10-28 (Kev, verbatim: "i am not going to buy quest 3/3s, just going to use quest 2"). Quest 2 is the dev device and
  the only test device; the former "Quest 3/3S test required before S12" step runs on Quest 2. The UE spike's Nov 1 device need is met
  by the Quest 2 in hand. Judges still play on Quest 3/3S (M6), so each gap is logged residual risk, not a blocker:
  A4-R1 perf: 3/3S (newer SoC) expected faster than Quest 2, so Quest 2 fps is the conservative bound, but 3/3S fps is unmeasured.
  A4-R2 scene: Quest 2 greyscale passthrough + manual Space Setup vs 3/3S colour passthrough + their own Space Setup; judge-room MRUK
    spawns are unverified (A5, S8).
  A4-R3 FoV: Quest 2 FoV differs from both 3S (~96 deg) and 3 (~110 deg) (A12); D8 arc-edge readability on judge FoV is unverified (S11).
  A4-R4 footage: no 3/3S colour-passthrough capture path; SP1 capture fallback is XR Simulator room footage only (D12).
A5 Quest 2 passthrough + manual Space Setup is a dev stand-in for MRUK, not evidence of judge-room behaviour (S8 matrix covers the
  gap). With no 3/3S (A4 waiver) it is also the only test rig: S8 runs on Quest 2; 3/3S colour passthrough + Space Setup stays
  residual A4-R2. On-device capture of passthrough is unverified (SP1 checks it).
A6 Repo (MIT) on a private GitHub remote with CI gitleaks from 2026-10-28; flipped public at G1 (Q2); privacy page + relay on
  Vercel free tier until Dec 11.
A7 Video public (rules.md:141) on a new YouTube channel for the game, not Kev's personal channel (Q1; M17 still never links that one).
A8 Judges likely play bundled starter decks; the relay is still shipped (M11) and must fail soft.
A9 Group workshops/office hours are not 1:1 mentorship (R9).
A10 Starter decks Kev-authored, no identifiable people or brands (R12). Q4 (2026-10-28): Opposites (warm-up), World Capitals (no
  disputed capitals; aliases e.g. Kyiv/Kiev), Basic Science (element names with one-word English answers, e.g. "Fe" -> "iron"); no
  Spanish. Topics locked by Oct 30 (SP2 recordings use real answers). Lint gate in S2.
A11 Wit transcript API may return only one hypothesis; plan uses the top hypothesis only.
A12 Quest 3S horizontal FoV ~96 deg, Quest 3 ~110 deg (recalled, not cited); D8 arc sized under both with margin; S11 verifies on
  Quest 2 only (A4 waiver; Quest 2 FoV differs again, residual A4-R3).
A13 The Wit Client Access Token is public once the APK ships (invite URL is on the Devpost page, rules.md:140); it cannot be rotated during the freeze.
A14 EditMode tests run on Mono in the Editor; the device runs IL2CPP with managed stripping. String.Normalize(FormKD) and char.GetUnicodeCategory on IL2CPP/Android are unverified (normalization tables may be stripped or unsupported), so EditMode green does not prove device matcher behaviour (S4 on-device self-test).
  Under Unreal (2026-10-28): A14 is N/A (C++ on desktop and device); kept for the Unity fallback.
A15 Seated hand reach: a slash within the 30 cm hand radius only reaches ~0.4-0.65 m in front of the head; enemies at the 1.2-3.5 m wall spawn are out of reach until they advance (D13).
A16 Judge count and concurrency are unknown; Wit per-app limits are compared against a planning figure of 5 concurrent sessions (SP2 burst), not a measured judge load.

## Design decisions
D1 ENGINE (Kev, 2026-10-28): Unreal Engine 5.7 + Meta XR plugins v207 (A2), gated by the UE spike (SP1 + SP2 on UE) passing by
  Nov 2; spike fails -> Unity 6.3 LTS and the Unity plan (rubric names ISDK/MRUK, R5; Voice SDK Unity-native). Prize eligibility is
  engine-neutral (guidelines.md:53). ADR 0001 records Unreal (spike-gated) vs Unity fallback (satisfies M13). Unity-specific terms in
  the slices (asmdef, EditMode, [TestFixture], TMP, JsonUtility, UPM, IL2CPP) apply to the Unity fallback; under Unreal they map to UE
  equivalents with slice scope and CRITERIA unchanged. IWSDK + vosk-browser = SP3, HELD (Q10): last resort if both engines fail G1;
  if SP3 wins G1, S-slices are re-planned Nov 4 and hosting is GitHub Pages from the PUBLIC repo (rules.md:140, guidelines.md:60 name a
  GitHub page; free because the repo is public, A6), which satisfies M20's rationale; if the repo is still private at that point,
  hosting is Vercel free tier per M20 (rules.md:138 allows it). No engine switch after Nov 4 (see G1 post-gate failure rule).
D2 STT behind IAnswerRecognizer; default Wit.ai (Unreal: direct HTTP; Unity fallback: Voice SDK); on-device grammar ASR
  (sherpa-onnx offline fallback; Vosk, Apache-2.0) only if Wit misses SP2 thresholds; its grammar = all deck answers + aliases + [unk].
  Mic opens at slash contact; an earcon plays only once the mic is live; SP2 measures first-word clipping. Answer window = from earcon
  until the recognizer's end-of-speech, capped at 6 s with no speech start (cap -> "didn't catch"); the mic is closed outside it. Mic is
  re-acquired on app focus/resume (Unity: OnApplicationPause/Focus; Unreal: the engine's app-lifecycle events), never assumed live.
D3 Matcher (deterministic, no LLM). Normalize: NFKD, drop combining marks (Unicode Mn), lowercase, strip punctuation, collapse whitespace, strip a leading article (a/an/the) only if the remainder is non-empty. Candidates = distinct normalized answer+alias strings across the deck, each mapped to the set of cards that own it. Correct: exact match to a candidate owned by this card; or fuzzy: both strings >=4 normalized chars, ratio = 1 - lev(a,b)/max(len a, len b) >= 0.85, first 4 normalized chars identical, nearest candidate owned by this card, margin >= 0.1 over the best candidate not owned by this card. Wrong: same rules resolve to a candidate not owned by this card; or exact hit on the card's `reject` list; or hedge guard (transcript contains "or"/"and" token absent from the answer). Everything else non-empty = miss. Negation guard dropped (prefix rule blocks leading "not/no/never"; ratio blocks the rest). No number-word conversion; top hypothesis only.
D4 Answer outcomes (single table; "encounter" = one card-enemy's card until it is removed; the FIRST scored attempt (correct or wrong) of an encounter sets its Leitner grade):

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

Orbs = 1 correct + 3 distractors drawn from distinct normalized answers not owned by this card (deck validation guarantees >=4 distinct answers). Silent mode: user toggle any time; latches automatically ONLY on mic permission denial.
Orb trigger: any 2 non-correct voice attempts in one encounter (wrong, miss, didn't catch, in any mix) -> orbs for this card; a player who keeps saying wrong answers is never stuck taking hits. Each voice attempt needs a fresh slash on the same card.
Ultimate charge: +1 per correct outcome (voice or orb, assisted or not); firing the ultimate resets charge to 0; ultimate kills do not add charge.
D5 SR = Leitner 5 boxes (0,1,3,7,14 d), due dates as UTC calendar days; box = enemy armor tier (visual only: armor look per box, no mechanical effect); grading per D4. Card ID = lowercase hex of the first 16 bytes of SHA-256 over UTF-8 of (NFC, trimmed, whitespace-collapsed front + U+001F + back) (never string.GetHashCode; no punctuation strip, so "5-3" != "53"); parser keeps the first of any duplicate ID and reports the count; editing a card's text makes it a new card by design. Empty due queue -> study-ahead: spawn lowest box, earliest next-due first. Save = JSON in persistentDataPath: write temp + flush; if primary missing -> File.Move(temp, primary), else File.Replace(temp, primary, .bak); load order primary -> .bak -> fresh state. Deck parser on device = JsonUtility (no polymorphic deserialization). JsonUtility is UnityEngine, so it lives in a thin Game.Json adapter asmdef that maps to plain DTOs; all validation (caps, required non-empty fields, >=4 distinct answers, duplicate IDs) lives in Core (noEngineReferences, S1). Deck schema root is an object {"version":1,"title":...,"cards":[{"front","back","aliases":[],"reject":[]}]} because JsonUtility cannot parse a top-level array and silently defaults missing fields; Core rejects defaulted/empty required fields.
  Under Unreal (2026-10-28): the JsonUtility / Game.Json adapter workaround is N/A (C++ parser in Core); kept for the Unity fallback.
D6 Pairing relay (M11), headset-shows-code direction: headset POST /pair -> function creates a 6-char Crockford code (32^6 ~ 1.07e9)
  with SET NX EX 900 and returns it; headset shows the code and polls GET /pair/<code> every 3 s for up to 15 min; companion paste page
  (laptop keyboard) POSTs the deck to /pair/<code>; function validates server-side (<=200 KB, <=500 cards, >=4 distinct normalized
  answers, no rich-text tags), first deck for a live code wins (conditional set), headset reads it with atomic GETDEL. Store = Upstash
  Redis via the Vercel Marketplace (sole client = the function; token server-side only); keys hold only code -> deck with TTL. Rate limit
  POSTs only, 10 POST/min per IP (both /pair and /pair/<code>): Vercel Firewall rate-limit rule if the free plan offers it (verify in
  S10), else @upstash/ratelimit with keys TTL = window; no GET limit (codes unguessable; GET-flood quota drain is accepted residual,
  remedy = RELAY_ENABLED off). Server and device normalization (NFKD, drop Mn/\p{Mn}, lowercase, strip punctuation, collapse whitespace)
  are checked against ONE shared fixture file (tests/fixtures/normalize.json) by both the C# and the JS test suites. RELAY_ENABLED env
  flag -> 503 -> headset shows "import unavailable", starter decks unaffected. Function never logs request bodies. Device re-validates
  caps and renders deck text with TMP rich text disabled. Imported decks: list in headset; delete = select + confirm + Undo
  (rules.global/ui-delete-needs-confirmation.md); a deleted deck is hidden, its card progress kept.
  Freeze policy (G0b, Kev 2026-10-28; rules.md:168): relay fail-soft is automatic (headset circuit breaker -> "import unavailable", no
  manual step). Nov 18-Dec 11 allowed ops are ONLY {RELAY_ENABLED flip off, byte-identical privacy-page redeploy}; no code changes. Each
  op is logged with timestamp + reason, and the policy is disclosed in the Devpost testing instructions.
D7 Dodge: baseline = mean head position over the 1.5 s before telegraph onset, FROZEN from onset until the attack resolves (overlapping attacks share the earliest frozen baseline until all resolve); the baseline rolls only outside attack windows. Dodge = lateral or downward displacement >=20 cm from the frozen baseline at the hit frame; forward lean ignored; all motion within 30 cm radius. Recenter or pause during an attack cancels that attack; baseline resets on recenter, resume, pause. Hand tracking lost (both hands) pauses attack timers and shows a "show your hands" prompt; no hit lands while paused. "Lateral or downward displacement" = Euclidean distance in the head-local lateral/vertical plane (forward axis dropped). Accessibility toggle: slower telegraphs + auto-dodge option. Ultimate = two-palm push.
D8 MR only. Play-forward yaw = tracking-space forward, recomputed on every recenter. Enemies emerge from MRUK walls 1.2-3.5 m away
  within +/-35 deg of play-forward (70 deg arc). An enemy's card text shows and its telegraph starts only while it is within +/-40 deg of
  current head yaw; otherwise its attack timer waits. Q5 (2026-10-28): this in-view gate is the head-gaze mechanic (rules.md:223), named
  as such in ADR 0001 and Devpost; gaze-dwell select is a D15 experimental toggle. Ring fallback (2.5 m, same arc, still passthrough)
  if: no scene, permission denied, MRUK timeout (5 s), no qualifying wall, or head outside the loaded room (MRUK current room null /
  point not in room).
D9 CREDITS.md from first commit; README credits GitHub KevinKbyte only, never the YouTube channel.
D10 Secrets + signing: dedicated Wit app holding no intents, training data or other projects; build ships ONLY the Client Access
  Token, treated as public (A13; ADR 0002 records it as accepted residual risk); the Server token never enters the project. Wit config
  (UE: token config file; Unity fallback: Voice SDK config asset) still gitignored and injected at build time from a file outside the
  repo. gitleaks local pre-commit hook from S1 with a
  custom Wit-token rule and a canary check; CI gitleaks on the private GitHub remote from 2026-10-28 (Q2). Release keystore created in
  SP1 outside the repo, *.keystore/*.jks gitignored, 2 backups (offline + cloud); SP2's v2 upload is signed with the keystore restored
  from backup. versionCode = build-script counter (built in SP1), strictly increasing per upload.
D11 Provenance: ADR 0003 records conception (2026-10-27 VR concept session) and new-vs-prior vs realm-of-recall (Feb 2026 2D
  turn-based recall RPG). Shared with it: recall-as-combat, spaced repetition, multiple-choice answers, enemy HP
  (realm-of-recall SPECIFICATION.md:50-53,531). New: VR hand-slash, voice answers, MR wall spawns, real-time dodge, multi-card health
  pools (one correct answer strips one card). The same list is written as a standalone Devpost paragraph that also serves as the Adapted
  "summary of new features" (rules.md:142) if the Sponsor re-assigns the division (rules.md:90). Devpost discloses realm-of-recall plainly.
D12 Video + screenshots: captured in a cleared room (no screens, photos, logos, branded products, windows to identifiable views, or people
  other than Kev) or room shots via XR Simulator (rules.md:141); frame-by-frame review before upload (rules.md:157, 161). Video opens
  with a 2-3 s flash-forward of the slash-then-speak moment in the real room (hackathon.md:75 "lead with your best material"), then the
  skit (tension + backstory), then full gameplay; no AI-generated footage (rules.md:237).
  Trailer beat sheet: see docs/devpost-draft.md; flash-forward + skit <=33 s, rest gameplay; D12 rules apply to the skit; breakout = D16.
D13 Engagement distance (finisher-added; resolves A15): an enemy emerges at its wall spawn (D8, 1.2-3.5 m, keeps M15), then advances
  along its spawn bearing to a strike slot 0.5 m in front of the play-forward head position, inside the +/-35 deg arc; slash contact,
  telegraphs and attacks happen only in the strike slot. Q8 (2026-10-28): 0.5 m is the default; the slot is calibrated per player
  within 0.40-0.60 m (S9). Max 1 enemy in the strike slot at a time; others queue at their walls. Card text sized for 0.5 m reading and
  checked again at the wall (S11).
D14 Run loop (finisher-added; rules.md:126,128 "Satisfying in <=10 minutes", bus-stop test): a run = up to 12 due cards (study-ahead
  fills if fewer) packed into enemies of 1, 2 or 3 cards (M2), in due order. Player has 5 shield pips; a hit removes 1, capped at 1 hit
  per encounter (Q8); at 0 the run ends early. First run = 6 cards, no-fail (0 pips does not end it). Every run ends in the mastery
  screen; Leitner grades are saved per answer (D5), so an early end loses no progress. Target run length 4-8 min. Q8 (2026-10-28): counts
  (12 cards, 5 pips) stay fixed; pacing (advance speed, attack cadence) is the tuning knob.
D15 Experimental settings pane (Kev, 2026-10-28): one on/off toggle per experimental feature; initially gaze-dwell select of answer
  orbs and menu buttons (1.2 s dwell, Q5) and a second, mastery-unlocked ultimate type (Q9; base build = 1 ultimate type fired
  repeatedly). S9 calibrates each with it on and off; anything that underperforms ships OFF in the submitted build and is not
  mentioned in Devpost or the video.
D16 In-game intro scene (Kev, 2026-10-28): on first launch a virtual phone placed on a detected table surface (MRUK) cracks and sad
  flashcards band together and swarm out, then combat starts; doubles as the trailer breakout shot (rules.md:237, no AI footage). Scope
  ~1 day UE, built in S9. Cuttable: if behind at S12, the skit falls back to paper cards + drawer and the intro is skipped. First
  launch only, <=10 s, skippable by any trigger or pinch. No-table fallback (D8 ring-fallback triggers, or no qualifying table): the
  phone spawns at waist height ~0.8 m in front of the player, facing them, and the same intro plays.

## Slices
UE spike (Kev, 2026-10-28; D1): SP1 + SP2 run on UE 5.7 + Meta XR 207 (MetaXRPlatform OFF) with direct Wit.ai HTTP voice; pass = SP1
  + SP2 CRITERIA by Nov 2; fail -> Unity 6.3 LTS. Setup: UE 5.7, Android NDK r27c, JDK. SP1 also creates a second (backup) Meta
  dashboard app (Q7). SP2 second speaker = Kev + several TTS voices/accents (Q6); residual (TTS cleaner than real speech) in ADR 0002.
SP1 Oct 28-Nov 1 (~7 h): Android toolchain (UE: NDK r27c + JDK; Unity fallback: Android module); Quest 2 dev mode; release keystore
  + 2 backups; versionCode build script; hello-hands+passthrough APK release-signed; Meta dashboard app + Competition channel; upload
  versionCode 1; invite URL install on a non-org account with App Sharing off; 10 s on-device capture shows the passthrough room. Kev
  checks whether Devpost has a judges-only field for the invite URL.
SP2 Oct 30-Nov 2 (~5 h), DEPENDS SP1 (Android toolchain + signed pipeline): starter-deck answers locked by Oct 30 (Q4 topics,
  A10; answers <4 normalized chars flagged and measured in the corpus); Wit app (client token only); privacy page stub deployed
  (needed before a mic-permission upload); Wit.ai voice spike (UE: direct HTTP; Unity fallback: Voice SDK) on deck-derived corpus;
  desktop burst script (5 concurrent requests on recorded corpus audio against the same Wit app) + published limits into ADR 0002;
  spike built release-config (IL2CPP ARM64, final stripping level + link.xml, final permission set RECORD_AUDIO/USE_SCENE/INTERNET),
  signed with the restored keystore, uploaded as versionCode 2, installed via invite URL; v2 also runs a 10-case normalization
  self-test from tests/fixtures/normalize.json on device (A14; fail -> Core uses a hand-rolled Latin fold table instead of
  String.Normalize, decided at G1). SP2b (only if SP2 voice numbers fail): on-device grammar ASR, same bars.
SP3 HELD (Q10, 2026-10-28; not scheduled): IWSDK + vosk-browser, GitHub Pages hosting. Last-resort fallback, run only if both the
  UE spike and the Unity 6.3 LTS fallback fail G1.
G0 resolved 2026-10-28 (Kev). G0a: New Experience claim (M5) kept with the D11 disclosure, re-assignment risk (rules.md:90-92) seen;
  the division field is set at S13 (editable until Nov 18 12:00 PT, guidelines.md:101). G0b: freeze policy per D6.
G1 Nov 3: default = Unreal 5.7 + direct Wit.ai HTTP if the UE spike passed by Nov 2, else Unity 6.3 LTS + Voice SDK (D1); SP2b
  recognizer if SP2 measured a voice failure; SP3 only if both engines fail (Q10). Unmeasured numbers do not block: default holds,
  unfinished SP1/SP2 checks run Nov 5 AM before S1 and must pass before S3. Repo flips public
  (Q2) only once a full-history gitleaks scan is green and .gitignore covers .claude/; else it stays private. ADRs 0001 (engine + SDK
  versions + head-gaze mechanic per D8/Q5), 0002 (STT, Wit limits, public token, plus a freeze-resilience row comparing cloud Wit vs
  on-device grammar ASR during Nov 18-Dec 11: outage/quota/token-abuse behaviour vs false-accept behaviour), 0003 (provenance).
Post-G1 failure rule (Nov 5 AM overflow checks): no engine switch after Nov 4. The G1 recognizer (Wit HTTP or Voice SDK) fails a
  Nov 5 check -> SP2b recognizer is built inside S4 behind IAnswerRecognizer (slip charged to the Nov 16 buffer). Invite-URL pipeline
  fails on Nov 5 -> build continues in the G1 engine (Unreal if the spike passed, else Unity), Kev escalates to Meta support + forum
  the same day, and the pipeline check repeats daily until green; still red on Nov 8 -> Kev decides (Q7; backup dashboard app, SP1).
S1 Nov 5 AM scaffold in the G1 engine. UE 5.7 (default): Meta XR plugins v207 (version check), MetaXRPlatform plugin OFF, Android
  NDK r27c + JDK, Core C++ module with no engine-module dependencies (D5). Unity 6.3 LTS (fallback): URP mobile, AIO SDK via UPM
  (version check), Core asmdef noEngineReferences + Game.Json adapter asmdef (D5). Both: git-lfs, .gitignore (Wit config, keystores,
  Builds/, *.apk, *.aab; UE Binaries/ Intermediate/ Saved/ DerivedDataCache/; Unity Library/ Temp/), gitleaks hook + Wit rule +
  canary script, CREDITS/README/CHANGELOG, spec file .claude/spec-cache/game/references/spec.md with FEAT IDs, shared
  tests/fixtures/normalize.json, credits audit script (lists non-code files under the engine asset root, Content/ or Assets/, missing
  from CREDITS.md; exit 1 on any; own test + README entry), headless test runner script (UE Automation tests; Unity: batchmode
  EditMode) (versionCode script already exists from SP1).
S2 Nov 5 PM core logic (may spill to Nov 6 AM; slip charged to the Nov 16 buffer): deck parser (JsonUtility, stable IDs,
  duplicate-ID drop, caps, >=4 distinct answers, reject list), matcher (D3), outcome table (D4) + orb trigger + ultimate charge, Leitner
  + study-ahead, run loop (D14), combat rules. Deck-lint gate (Q4): numeric answers rejected; answers <4 normalized chars flagged
  (exact-match only under D3) for SP2 measurement; homophone answers need an alias (e.g. sun/son).
S3 Nov 6 slash + card enemy (wall emerge -> advance to strike slot, D13) + answer window + damage.
S4 Nov 7 voice via IAnswerRecognizer + D4 outcomes (per-card fallback, 3 s timeout, 429) + earcon + mic re-acquire on resume.
S5 Nov 8 silent orbs + toggle.
S6a Nov 9 (half day, MemriPal finals) Leitner persistence (D5 save) + EditMode save tests + mastery screen.
S6 Nov 10 health pools, telegraphed attacks (in-view gate), dodge (frozen baseline), hand-tracking-loss pause (D7), shield pips + run end (D14), accessibility toggle.
S7 Nov 11 ultimates (5 correct, two-palm push; 1 type, Q9) + experimental second, mastery-unlocked ultimate type behind its D15 toggle.
S8 Nov 12 MR walls + arc + fallback + test matrix. CHECKPOINT Nov 12 evening: apply constraint ladder if any of S1-S8 open.
S9 Nov 13 first-five-minutes tutorial (incl. per-player strike-slot calibration, D13), pause/resume (voice re-arm), accessibility
  pass, D15 Experimental pane + gaze-dwell select, on/off calibration of each D15 toggle, D16 phone-breakout intro (cuttable).
S10 Nov 14 relay (D6) + automated function tests + headset pairing + imported-deck list + privacy policy final; relay circuit
  breaker (G0b); Upstash idle-archive check (free database must not be archived while idle through Dec 11).
S11 Nov 15 perf + polish + CREDITS audit (script) + device test on Quest 2 (incl. FoV at the arc edge; re-scoped from Quest 3/3S
  by the A4 waiver, so the Nov 1 / Nov 15 3/3S device dates are void and S8 walls run on Quest 2; residuals A4-R1..R3) + RC upload.
S12 Nov 16 buffer + RC invite install verify + fresh-install save check + video capture (D12).
S13 Nov 17 video review + Devpost (rules.md:139-144,155; hackathon.md:80: tagline (140 chars), track Gaming, division (New Experience
  per G0a unless re-ruled; editable until Nov 18 12:00 PT, guidelines.md:101), invite URL (judges-only field if one exists), video link,
  text description with inspiration / how built / future plans / target launch date, D11 paragraph, testing instructions incl. the G0b
  freeze-ops disclosure, screenshots; content rating per rules.md:154, target 10+); submit by 21:00 PT. Nov 18 bugfix-only, no uploads
  after 08:00 PT.
F Nov 18-Dec 11 freeze; weekly checks, each with its action: Wit utterance (fail -> none possible, log residual; orbs carry play);
  relay round-trip (fail -> check quota, flip RELAY_ENABLED off if abused); privacy URL 200 (fail -> byte-identical redeploy of the
  static page); channel install (fail -> contact Meta support). Every relay/privacy op logged with timestamp + reason (G0b, D6). After
  Dec 11: Kev purges the Wit utterance log and Upstash keys per the privacy policy retention.

## Evaluation criteria (CRITERIA, countable, pre-code)
SP1 (on Quest 2, A4) release-signed install via invite URL on non-org account 1/1; versionCode 1 accepted 1/1; hands 2/2; passthrough
  on; >=72 fps empty scene; 10 s capture shows room 1/1 (fail -> plan XR Simulator room footage before S12; the Quest 3 option is
  dropped by the A4 waiver, residual A4-R4).
SP2 corpus = real deck answers, Kev + several TTS voices/accents as the second speaker (Q6; residual: TTS cleaner than real speech,
  logged in ADR 0002): >=27/30 correct accepts; >=15 wrong-answer/noise utterances with 0 false accepts; p95 <=1.5 s from end of
  speech; 0 first-word clips/30 (clip = transcript lacks the scripted first word); 0 crashes/30; burst 5 concurrent x 6 rounds executed
  1/1 with its 429 count recorded in ADR 0002 (pass bar 0; >0 does not flip G1, is logged as residual, and raises S4's forced-429 test
  to 3/3); v2 (release config, final permissions, restored keystore) accepted 1/1; after invite install, 1 voice answer transcribed + 1
  MRUK room query returns 1/1; on-device normalization self-test 10/10 (or Latin-fold fallback chosen at G1); privacy URL 200.
SP2b same bars as SP2, explicitly incl. >=15 wrong/noise utterances with 0 false accepts.
G0 Kev decisions recorded 2026-10-28 (G0a claim kept, G0b allowed-ops list) 2/2. G1 stack recorded with which SP numbers it rests on;
  ADRs 0001-0003 written; ADR 0002 freeze-resilience row present 1/1; ADR 0001 names the D8 in-view gate as the head-gaze mechanic 1/1;
  public flip only after full-history gitleaks exit 0 AND `git check-ignore .claude/` exit 0 (2/2), else repo stays private.
S1 headless test runner exit 0 (UE Automation; Unity: EditMode); 0 vendored Meta SDK sources in the repo; resolved Meta XR version
  recorded and matches hackathon.md:63 v207 (UE: Meta XR .uplugin VersionName; Unity: AIO/ISDK in Packages/packages-lock.json); UE
  only: MetaXRPlatform plugin disabled in the .uproject 1/1; gitleaks exit 0 on full history AND canary (fake Wit-format token in a
  scratch engine config file, never committed) -> exit 1; git check-ignore 6/6 (Wit config, x.keystore, x.jks, Builds/x, x.apk,
  x.aab); spec file exists; Core compiles with 0 engine references (UE: no engine-module dependencies; Unity: 0 UnityEngine
  references); credits audit script exit 0 on a clean tree and exit 1 on an uncredited fixture file (2/2).
S2 >=40 matcher golden cases, all run with EMPTY reject lists unless the case tests the reject list: >=10 generic near-miss rejects
  (afferent/efferent, hypertonic/hypotonic, exothermic/endothermic, Prussia/Russia, hypo/hyperthyroidism, "not X", "X or Y", answer "A",
  accented vs unaccented, shared-answer cards) + topic cases added after SP2; D4 table: 1 test per row (9/9) incl. wrong-then-orb-correct
  -> no promote, ultimate -> no grade change; 5 Leitner transitions + study-ahead when 0 due; >=8 malformed decks rejected (incl. <4
  distinct answers); ID stable across reorder; "5-3" vs "53" distinct IDs; duplicate card -> 1 ID kept; 1 fixed SHA-256 ID golden value;
  top-level-array JSON and a card with a missing/empty front each rejected 2/2; normalize.json fixture N/N; orb trigger: wrong+miss,
  miss+didn't-catch, wrong+wrong each -> orbs 3/3; ultimate charge: orb correct counts 1/1, reset to 0 after firing 1/1, ultimate kills
  add 0 1/1; run loop: 12-card cap 1/1, pools only of size 1-3 1/1, 5th hit ends run 1/1, grades saved before run end 1/1, 2nd hit in
  one encounter removes 0 pips 1/1, first run = 6 cards and not ended at 0 pips 1/1; deck-lint (Q4): numeric answer rejected, 3-char
  answer flagged, homophone answer without alias flagged 3/3, 3 starter decks pass 3/3; `// Covers: FEAT-ID` above every [TestFixture].
S3 20/20 slashes register (slash = fingertip speed >=1.0 m/s through the card collider in the strike slot); 0 false triggers in 60 s idle; 5/5 enemies travel wall -> strike slot and no slash registers before arrival.
S4 0 mic opens outside window; 3/3 forced hard STT errors -> orbs <1 s AND next card's voice answer works 3/3; forced 429 -> per-card orbs 1/1; empty transcript -> 0 damage 3/3; 2 non-correct attempts -> orbs 3/3; 6 s silence -> didn't catch 3/3; Wi-Fi off: every card reaches orbs <=4 s after its answer window opens and the run completes 1/1; silent mode not auto-latched by any error except mic denial 1/1.
S5 full run with mic off 1/1.
S6a EditMode: fresh dir first save then load 1/1; corrupt primary -> .bak 1/1; truncated primary + missing .bak -> fresh state 1/1; boxes persist across app restart on device 3/3.
S6 3-card pool with no ultimate needs exactly 3 correct; dodge at >=20 cm lateral/down; lean at telegraph start held through a 2 s telegraph -> dodged 3/3; same with accessibility slow telegraph 3/3; slow 1 s lean -> dodged 3/3; 0 false dodges in 20 forward-lean slashes; recenter + resume then dodge correct 3/3; enemy outside +/-40 deg never starts a telegraph 3/3; hands hidden mid-telegraph -> 0 hits and prompt shown 3/3; telemetry over 1 full run: max head displacement from run start <=30 cm 1/1 and 100% of slash contacts <=0.65 m from the head.
S7 ultimate at exactly 5; 0 ultimate triggers in 60 s of slashing; D15 toggle OFF -> second ultimate type never offered 1/1.
S8 matrix 8/8 (no scene, permission denied, walls only behind, far wall >3.5 m, cluttered room, MRUK timeout, head outside loaded room, recenter after chair turn) -> correct spawn or ring fallback; 100% spawns within +/-35 deg of play-forward at 1.2-3.5 m.
S9 first correct kill <90 s, timed from D16 intro end or skip (2 testers who have not played it; if none by Nov 13, Kev on a fresh
  install, residual logged); 3 runs: median 4-8 min, max <=10 min, early-end rate (runs ended at 0 pips / runs) recorded (Q8);
  pause/resume 3/3 AND voice answer works after resume 3/3; system menu open/close then voice works 3/3; cold start <10 s; strike slot
  calibrates within 0.40-0.60 m 3/3; gaze-dwell ON: 1.2 s dwell selects 3/3, shorter glance selects 0/3;
  Experimental pane lists 2/2 toggles, each flips live and persists across restart 2/2; each toggle run on and off against these S9
  metrics with the result logged 2/2; every underperformer is OFF in the RC build and absent from Devpost + video (D15).
S10 round-trip 3/3 (headset shows code, page posts, deck in headset <=5 s after POST); oversize/malformed/<4-answers/expired/
  reused-code rejected 5/5; concurrent double GET -> exactly 1 gets deck 1/1; 11th POST in 60 s from one IP -> 429 1/1; relay function
  automated tests exit 0 with `// Covers:` tags and normalize.json fixture N/N in JS; RELAY_ENABLED=false -> 503 and headset shows
  "import unavailable" 1/1; relay unreachable -> headset circuit breaker shows "import unavailable" with no manual step 1/1; Upstash
  free-tier idle-archive policy checked and the database stays active idle through Dec 11 1/1; 0 Upstash token hits in built page
  bundle (grep); rich-text tags rendered literal 1/1; deck delete needs confirm and Undo restores 1/1; privacy page lists 7/7 (Wit
  audio+transcripts with retention, bystander speech, rate-limit IP keys with TTL, function logs without bodies, deck 15-min storage,
  scene data stays on device, deletion contact).
S11 median >=72 fps, 1% low >=60 over 5 min Quest 2; Quest 3/3S run waived 2026-10-28 (A4), residual A4-R1 logged 1/1; on Quest 2:
  card text + telegraph readable at arc edge 1/1 (judge-FoV residual A4-R3); credits audit script exit 0 (0 uncredited assets);
  on-device normalization self-test 10/10 on the RC build; RC upload accepted.
S12 RC invite install non-org account 1/1; cold launch 3/3; fresh install -> answer 3 cards -> relaunch -> boxes persist 1/1; voice answer after fresh install 1/1.
S13 video <180 s public logged-out; frame review 0 hits (people, logos, brands, screens, photos); Devpost "submitted" with D11
  paragraph; Devpost fields 9/9 (tagline <=140 chars, track Gaming, division set per G0a, invite URL, public video link, description
  incl. inspiration/how built/future plans/target launch date, testing instructions incl. mic + scene permission prompts, silent-mode
  toggle and G0b freeze-ops disclosure, >=3 screenshots passing frame review, content rating recorded).

## External signals (SIGNALS)
OVR Metrics on device; Meta dashboard channel status + versionCode; invite URL on non-org account; Vercel deploy + Firewall/ratelimit
  logs; Upstash usage dashboard; gitleaks local hook + CI on the private GitHub remote (Q2); logged-out video playback; Devpost page; Wit
  app dashboard (usage, 429s).
Per slice (FLOW-016): SP1 Meta dashboard versionCode 1 + invite install on non-org account + OVR Metrics. SP2 Wit dashboard (burst
  429s) + dashboard versionCode 2 + invite install + privacy URL HTTP 200. SP2b on-device run only (none external beyond SP2's upload).
  SP3 GitHub Pages/Vercel URL loads on Quest Browser. G0 none. G1 CI gitleaks full-history run green before the public flip. S1
  gitleaks local hook. S2 none. S3 none. S4 Wit dashboard (requests visible, forced-429 run). S5 none. S6a none. S6 none. S7 none. S8
  none. S9 none. S10 Vercel deploy + Firewall/ratelimit log + Upstash usage dashboard (incl. idle-archive setting). S11 OVR Metrics
  (Quest 2; 3/3S waived, A4) + dashboard RC versionCode. S12 invite install on non-org account. S13 logged-out video playback + Devpost
  "submitted" page. F Wit dashboard, Upstash dashboard, privacy URL, channel install.

## Blast radius / rollback
Missed deadline = no entry (submit early; pipeline proven in SP1/SP2 with a release-config build). Frozen bug unfixable (bugfix window, T-4h no uploads). Wit outage, abuse of the public client token, or quota exhaustion in judging -> per-card orbs, voice retried every card (residual: headline mechanic degraded while it lasts). Relay abused or down (incl. GET flood draining Upstash/Vercel quotas, no GET limit by design) -> RELAY_ENABLED off, starter decks work. IL2CPP normalization missing on device -> Latin fold table (caught in SP2, not S11). Lost keystore -> 2 backups (restore proven in SP2). One commit per slice; channel keeps prior build.

## Rejected alternatives
Web Speech API (R15,R20). LLM grading (nondeterministic, injectable). SM-2/FSRS (over-built). Reusing realm-of-recall/MemriPal (R19). Multiplayer. Muse relay (needs live server+key). Palm-shield assist (collides with two-palm ultimate). VR arena (unscheduled, rules.md:215). n-best matching + number-word conversion (false-accept bias, aliases suffice). Page-issues-code relay (needs VR text entry). Hand-rolled per-IP KV counter + GET rate limit (quota drain, unneeded given code space). Device kill-mid-write test (nondeterministic). One-way silent-mode latch on STT error. Server-side code patches during the freeze (rules.md:168).

## Kev-only manual actions
Devpost Join Hackathon (+ check for a judges-only invite-URL field); forum Start Member flair; workshop/office-hour dates; Meta
  dashboard org/app/Competition channel/privacy URL (SP1-SP2); release keystore + 2 backups (SP1); non-org Meta account for invite test
  (SP1); private GitHub remote + CI gitleaks (now), public flip at G1 (Q2); dedicated Wit.ai app + client token (SP2); second speaker
  for SP2 (Q6: TTS voices); UE 5.7 + Android NDK r27c + JDK (Unity 6.3 LTS + Android module only on fallback); backup Meta dashboard
  app (Q7); Vercel account + Upstash integration; new YouTube channel for the game (Q1); cleared room for capture (D12); privacy
  deletion contact address; Quest 3/3S access dropped (A4 waiver 2026-10-28: Quest 2 only); 2 fresh S9 testers (Nov 13); content
  rating choice (S13, target 10+); Devpost tagline + division field + description + testing instructions sign-off (S13); optional: email
  MetaHorizonStart@meta.com for a division pre-ruling (G0a); log every judging-period op with timestamp + reason (G0b); after Dec 11
  purge Wit utterance log + Upstash keys.

## Open questions

Resolved 2026-10-28 (Kev):
- ENGINE Unreal 5.7 + Meta XR v207, spike-gated by Nov 2; Unity 6.3 LTS fallback (M9, M13, A2, A3, A14, D1, D2, D5, G1).
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
  early-end rate; pacing is the tuning knob, not counts (D13, D14, S2, S9).
- Q9 Base build = 1 ultimate type fired repeatedly; second mastery-unlocked type is a D15 experimental toggle (S7, ladder).
- D15 Experimental settings pane (new; S9 calibrates each toggle on/off; underperformers ship OFF, unmentioned).
- G0a New Experience claim kept with D11 disclosure; division field set at S13 (guidelines.md:101); optional pre-ruling email (Kev
  actions).
- G0b Relay fail-soft automatic; judging-period ops only {RELAY_ENABLED off, byte-identical privacy redeploy}, logged + disclosed in
  Devpost testing instructions; S10 Upstash idle-archive check (D6, S10, F, S13).

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

Round-1 cheat sheet superseded by the one below.

## Adversarial cheat sheet
- Primary technical risk: the headline voice mechanic could die silently for judges. Any brief speech-recognition fault (system menu, network blip, 429) latched silent mode for the rest of the session. All judges share one Wit app whose client token is effectively public, with unchecked quotas. And the first release-config build with stripping plus mic/scene permissions didn't happen until Nov 15.
- Fix: speech failures now fall back to orbs for that card only, with voice retried on the next card and the mic re-acquired on resume;
  only mic-permission denial latches silent mode. The Wit client token is treated as public, the Wit limits go in ADR 0002, and SP2 runs a
  5-concurrent burst test. The SP2 voice spike ships as versionCode 2 in release config, with final permissions and the restored keystore,
  and must pass voice + MRUK checks after an invite-URL install before G1. Also: the matcher gets a 4-char prefix rule and a single
  outcome/grading table, the dodge baseline freezes at telegraph onset, and the spawn arc is +/-35 deg. Finisher pass: enemies now advance
  from the wall to a 0.5 m strike slot (they were out of hand reach). Core stays engine-free (JsonUtility moved to an adapter). A run loop +
  shield pips give a <=10 min session. String normalization gets an on-device self-test on IL2CPP. G1 must record a freeze-resilience row.
  Kev's licensing/hosting/privacy asks are listed as M18-M21, and the deck floor is 2.
- Lingering doubt: should cloud Wit be the default recognizer at all? On-device grammar ASR (SP2b) would remove the cloud dependency that can't be patched or re-keyed during the freeze, but it snaps noise onto deck answers. G1 now records freeze resilience in ADR 0002, but the default still rests on SP2 accuracy, so the call is Kev's once the row is written.
