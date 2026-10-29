# VR flashcard combat game: build plan (Meta VR Start 2026, Gaming / New Experience)
Date: 2026-10-28. Status: hardened by /super-plan (2 adversary rounds + finisher). Source: offload run vr-flashcard-superplan-20261028-075442.
GOAL: judged Quest 3/3S build (dev + test on Quest 2 only, A4 waiver; residuals A4-R1..R4); seated player slashes card-enemies by
  hand, answers by voice or silent orbs; live in "Competition" channel by Nov 18 12:00 PT, unchanged to ~Dec 11. Success = Devpost
  submitted + invite URL installs on a non-org account + >=60 fps on device (Quest 2; 3/3S unmeasured, A4-R1) + voice answer works
  after a fresh invite-URL install. Decision: stack at gate G1 (Nov 3, off the MemriPal Nov 4 deadline).
Out of scope: multiplayer, LLM grading, MemriPal or realm-of-recall code/assets (recon R19), VR (non-passthrough) arena,
  post-Dec-11 MemriPal import (separate branch, never the judged channel).
Facts: R1-R20 in [2026-10-28-vr-flashcard-recon.md](2026-10-28-vr-flashcard-recon.md).
Kev decisions 2026-10-28: ENGINE (Unreal 5.7, spike-gated; D1), Q1, Q2, Q4-Q12, G0a, G0b, new D15, D19 (see Open questions + ledgers).
Changes from v1: see Ledger (finisher), then Ledger (adversary round 2), then round 1, in
  [2026-10-28-vr-flashcard-game-ledgers.md](2026-10-28-vr-flashcard-game-ledgers.md). Sources re-checked in the primary checkout for
  this pass: rules.md:88-143,154-168,195-239,318-330; guidelines.md:44-62,102-112; hackathon.md:63-75.

## Must-keep (Kev verbatim asks; never defer/cut/descope without Kev's explicit ask)
M1 Enemies are flash cards; slash with hand or controller (Q12), then say the answer aloud; correct = damage.
M2 Bigger enemies = multi-card health pools.
M3 Enemies attack; player dodges (lean/duck).
M4 Ultimates unlocked after N correct answers.
M5 Gaming track, New Experience division (G0a 2026-10-28: claim kept with D11 disclosure; Devpost division field final at S13).
M6 Hands-first, controllers also supported (Q12); seated, 2 ft (design limit <=30 cm head/hand radius satisfies both rules.md:122 radius
  and guidelines.md:47 diameter readings); judged on Quest 3/3S; >=60 fps.
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
M20 Hosting: Vercel/Netlify free tier if web (GitHub Pages from a private repo needs a paid plan). Reconciled with D1 in FIN-3 (ledgers file).
M21 Post-Dec-11: integrate MemriPal cards (separate branch, never the judged channel; see M16).
M22 Agent validation loop (Kev 2026-10-28; D18): "could you have a validation loop without me having to check in vr myself till it's
  complete? so that you can see what the game looks like yourself while you play it and fix bugs"
M23 Reusable E2E suite, affected-only (Kev 2026-10-28; D18): "we should have E2E testing too, that are reusable so that we can ensure
  stability as featuresets grow"; "E2E is expensive isnt it? so it shouldnt be run all the time - only hte ones that would be affected
  by the changed code should run"; "same as the other tests (unit tests etc) - but that should already be part of your plan considering
  i think agent workflow user level configuration enforces that already for this"; "we need to make this deterministic as possible
  otherwise youll be like next session i am running every E2E test (and then it just slows everyhting to a halt and then i ask why and
  you say my e2e tests)"
M24 Wave survival + win condition (Kev 2026-10-28; D19): "#1 - the win condition would be once you attain such high success rates for
  the entire deck they are working towards that user is not getting anything out of it anymore. So a wave user can select what decks
  they want to be part of the round, and theres an option to have all decks. There can also be endless mode but user would have to
  select it intentionally"; "if the user goes through the entire deck and is beating everything with 99%+ accurracy and they keep it
  going for 1-2 minutes we can say they won, unless if they selected endless mode"
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
  Every Leitner write (D4 grading, study-ahead included) obeys the D19 daily grade lock.
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
  fills if fewer) packed into enemies of 1, 2 or 3 cards (M2), in due order, as D19 graded waves, then D19 Overtime. Player has 5 shield
  pips; a hit removes 1, capped at 1 hit per encounter (Q8); the run ends at 0 pips, on WIN or on Retreat (D19; Endless only at 0 pips).
  First run = 6 cards, no-fail (0 pips does not end it), no Overtime: it ends after its graded waves. Every run ends in the mastery
  screen; Leitner grades are saved per answer (D5), so an early end loses no progress. Target graded-phase length 4-8 min; Overtime and
  Endless are open-ended. Q8 (2026-10-28): counts (12 cards, 5 pips) stay fixed; pacing (advance speed, attack cadence) is the tuning knob.
D15 Experimental settings pane (Kev, 2026-10-28): one on/off toggle per experimental feature; initially gaze-dwell select of answer
  orbs and menu buttons (1.2 s dwell, Q5) and a second, mastery-unlocked ultimate type (Q9; base build = 1 ultimate type fired
  repeatedly). S9 calibrates each with it on and off; anything that underperforms ships OFF in the submitted build and is not
  mentioned in Devpost or the video.
D16 In-game intro scene (Kev, 2026-10-28): on first launch a virtual phone placed on a detected table surface (MRUK) cracks and sad
  flashcards band together and swarm out, then combat starts; doubles as the trailer breakout shot (rules.md:237, no AI footage). Scope
  ~1 day UE, built in S9. Cuttable: if behind at S12, the skit falls back to paper cards + drawer and the intro is skipped. First
  launch only, <=10 s, skippable by any trigger or pinch. No-table fallback (D8 ring-fallback triggers, or no qualifying table): the
  phone spawns at waist height ~0.8 m in front of the player, facing them, and the same intro plays.
D17 Onboarding cues, show don't tell (Kev, 2026-10-28; workshop notes show-dont-tell.md + which-cue-when.png, Jelitza): pick the cue
  that answers the player's current question: How? -> ghost hand; What? -> glow + motion; Where? -> signage in the world; names/
  numbers? -> text + a visual. Max 1 active cue at a time; step up with idle time (rim glow -> pulse/bob -> ghost hand); retire each
  cue on success; a hint toggle replays cues. Slash (M1): ghost of the player's input (controller model on controllers; hand model +
  handedness when hand-tracked) loops a slash through the strike-slot card (D13); first run (D14) only; retired at first contact.
  Which enemy: rim glow only on the strike-slot enemy; wall-queued enemies unlit. Multi-layer enemies (M2; Kev: "higher level cards
  have multiple layers"): visible card stack, only the top card highlighted/answerable, each correct answer peels one. Answer: D2
  mic-live earcon + pulsing mic glyph on the card. Silent-mode orbs (M10): all pulse equally on idle, never singling out the correct
  one. Where: wall-crack light at each spawn (M15, D13). Dodge (M3, D7): floor lean-direction marker on the first telegraph of the
  first run; retired after the first dodge. Ultimate (M4, two-palm push): palms glow when charged; ghost-hands demo on first charge
  only. Text only for card prompt/answer/numbers, always paired with a glow. Built per slice: S3 slash/glow/stack, S4 mic glyph, S5
  orbs, S6 dodge marker, S7 ultimate. Cuttable: falls back to the constraint ladder's "tutorial as 3 prompts" (Must-keep). Open:
  diegetic wrist-turn UI (pop-up in the hand on a wrist turn) for hints/mastery (Kev's note).
D18 Agent validation loop + reusable E2E suite (Kev, 2026-10-28; M22, M23): the agent plays, sees and fixes the game unattended; Kev
  checks in VR at 3 points only (after the Nov 2 spike, once the core loop works, before submission) for what tooling cannot judge:
  comfort/sickness, slash feel, real hand-tracking accuracy, mic in a noisy room, video sign-off. Debug input layer: console commands
  for slash, dodge, ultimate (two-palm push) and "answer <text>" (injects text past Wit.ai, so logic is tested without a mic);
  stripped from shipping builds. Structured event log (spawn, hit, layer peel, answer, grade, dodge, pip lost, frame time) is the
  assertion surface.
  T0 headless logic: UE Automation, `-nullrhi`, seconds, on every change.
  T1 rendered E2E on PC with the Meta XR Simulator (OpenXR runtime, synthetic rooms), before each commit:
    `UnrealEditor-Cmd <proj> -ExecCmds="Automation RunTests <filter>; Quit" -unattended`, real RHI (screenshots need it, never -nullrhi).
    Functional tests save screenshots + the event log; the agent reads the screenshots for visual bugs (missing glow, >1 active D17
    cue, clipping, layout).
  T2 on-device Quest 2, at milestones: Gauntlet `RunUnreal -platform=Android -device=<serial>` (fallback BuildCookRun -deploy -run);
    headset unworn via the proximity bypass `adb shell am broadcast -a com.oculus.vrpowermanager.prox_close` (re-send each run);
    capture with `adb shell screenrecord`/`screencap`; fps via OVR Metrics Tool CSV over adb; asserts M6 fps.
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
  Reusable suite (M23): each mechanic slice S3-S7 adds >=1 scenario built from shared step helpers (start run, spawn card, slash,
    answer, dodge, ultimate); scenario = scripted inputs + event-log asserts + baseline screenshots compared with tolerance. The
    suite never shrinks: a superseded scenario is replaced, not deleted.
  Unverified premises (docs-checked 2026-10-28; SP1/Nov 2 spike checks, each with a fallback): (1) UE 5.7 + Meta XR Simulator
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
D19 Wave survival + win (Kev, 2026-10-28; M24, Q11, Q12): per round the player picks deck(s), incl. "all decks"; Endless is an explicit
  opt-in (default off). Graded waves = the D14 run cards (due, study-ahead fills), 3 cards per wave (12 -> 4 waves, 6 -> 2); pool size
  ramps 1 -> 2 -> 3 (M2), attack cadence ramps, last graded wave = one 3-card boss. Overtime waves follow until 0 pips: tonight's
  misses first, then selected-deck cards not yet shown this run, then recycled seen cards; zero Leitner writes; each wave faster. WIN
  (checked after every answer; never in Endless): every card in the selected deck(s) shown this run (not-due cards served ungraded,
  no Leitner write) AND accuracy over the last 90 s of answers >=99% (window tuned 60-120 s in S9; answer = any D4 outcome except Hard
  STT error and Ultimate; under 100 answers in the window, 99% means 0 non-correct). Endless ends only at 0 pips. Retreat any time ->
  mastery screen. Mastery screen: waves survived, personal best (int in the D5 save), next-due count worded "next uprising: N cards"
  (due dates are UTC days, so the count rolls at UTC midnight, not local midnight). Daily grade lock: max 1 Leitner write per card per
  UTC day; closes the study-ahead hole (D4 grades the first scored attempt per encounter and D5 study-ahead re-serves not-due cards,
  so repeat runs could walk one card box 0 -> 4 in a day). First run (D14) stays 6 cards, no-fail, no Overtime. Horde = the D13 wall
  queue. Wreckage = the D17 wall-crack persists and grows one tier per wave on MRUK wall planes; ring fallback (D8) = a barricade
  taking the same tiers; decal count capped, checked at S11 >=60 fps. Built: S2 packing + grade lock + Overtime + win check, S6 run
  end, S6a mastery fields + PB save, S8 wreckage + barricade, S9 deck select + Endless + Retreat + window tuning, S11 decal cap.

## Slices
UE spike (Kev, 2026-10-28; D1): SP1 + SP2 run on UE 5.7 + Meta XR 207 (MetaXRPlatform OFF) with direct Wit.ai HTTP voice; pass = SP1
  + SP2 CRITERIA by Nov 2; fail -> Unity 6.3 LTS. Setup: UE 5.7, Android NDK r27c, JDK. SP1 also creates a second (backup) Meta
  dashboard app (Q7). SP2 second speaker = Kev + several TTS voices/accents (Q6); residual (TTS cleaner than real speech) in ADR 0002.
SP1 Oct 28-Nov 1 (~7 h): Android toolchain (UE: NDK r27c + JDK; Unity fallback: Android module); Quest 2 dev mode; release keystore
  + 2 backups; versionCode build script; hello-hands+passthrough APK release-signed; Meta dashboard app + Competition channel; upload
  versionCode 1; invite URL install on a non-org account with App Sharing off; 10 s on-device capture shows the passthrough room. Kev
  checks whether Devpost has a judges-only field for the invite URL. D18 premise checks (1)-(6), each with its fallback.
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
  EditMode) = the D18 runner (T0/T1, affected selector + path-to-tag map + reference scan, run log), D18 runner-bypass hook, debug
  input layer, event log, first scenario (start run) (versionCode script already exists from SP1).
S2 Nov 5 PM core logic (may spill to Nov 6 AM; slip charged to the Nov 16 buffer): deck parser (JsonUtility, stable IDs,
  duplicate-ID drop, caps, >=4 distinct answers, reject list), matcher (D3), outcome table (D4) + orb trigger + ultimate charge, Leitner
  + study-ahead, run loop (D14), combat rules. Deck-lint gate (Q4): numeric answers rejected; answers <4 normalized chars flagged
  (exact-match only under D3) for SP2 measurement; homophone answers need an alias (e.g. sun/son).
S3 Nov 6 slash + card enemy (wall emerge -> advance to strike slot, D13) + answer window + damage + D17 cues + D18 scenario.
S4 Nov 7 voice via IAnswerRecognizer + D4 outcomes (per-card fallback, 3 s timeout, 429) + earcon + mic re-acquire on resume + D17 cue
  + D18 scenario.
S5 Nov 8 silent orbs + toggle + D17 cue + D18 scenario.
S6a Nov 9 (half day, MemriPal finals) Leitner persistence (D5 save) + EditMode save tests + mastery screen.
S6 Nov 10 health pools, telegraphed attacks (in-view gate), dodge (frozen baseline), hand-tracking-loss pause (D7), shield pips + run
  end (D14), accessibility toggle + D17 cue + D18 scenario.
S7 Nov 11 ultimates (5 correct, two-palm push; 1 type, Q9) + experimental second, mastery-unlocked ultimate type behind its D15 toggle
  + D17 cue + D18 scenario.
S8 Nov 12 MR walls + arc + fallback + test matrix. CHECKPOINT Nov 12 evening: D18 T2 run; apply constraint ladder if any of S1-S8 open.
S9 Nov 13 first-five-minutes tutorial (incl. per-player strike-slot calibration, D13), pause/resume (voice re-arm), accessibility
  pass, D15 Experimental pane + gaze-dwell select, on/off calibration of each D15 toggle, D16 phone-breakout intro (cuttable).
S10 Nov 14 relay (D6) + automated function tests + headset pairing + imported-deck list + privacy policy final; relay circuit
  breaker (G0b); Upstash idle-archive check (free database must not be archived while idle through Dec 11).
S11 Nov 15 perf + polish + CREDITS audit (script) + device test on Quest 2 (incl. FoV at the arc edge; re-scoped from Quest 3/3S
  by the A4 waiver, so the Nov 1 / Nov 15 3/3S device dates are void and S8 walls run on Quest 2; residuals A4-R1..R3) + D18 T2 run
  + RC upload.
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
  D18 runner: exit 0 on T0 and T1 1/1 each; T1 >=1 screenshot for the first scenario 1/1; no base -> exit non-zero 1/1; grep finds 0
  full-run flags, env vars, defaults or test-name/filter/"all" arguments 1/1.
  D18 bypass hook tests: direct `UnrealEditor-Cmd ... Automation RunTests`, `RunUAT ... RunUnreal` and Unity `-runTests` -> deny
  naming the runner 3/3; runner call -> allow 1/1.
  D18 run log: selected count + per-test reason + wall time printed and logged 1/1; whole-suite selection logs the reason 1/1.
  D18 selector regression tests 4/4: unmapped path with 0 references -> 0 tests; unmapped path referenced by scenario X -> X only;
  single-mechanic change -> only that mechanic's scenarios; full suite only when dependency resolution selects every test.
S2 >=40 matcher golden cases, all run with EMPTY reject lists unless the case tests the reject list: >=10 generic near-miss rejects
  (afferent/efferent, hypertonic/hypotonic, exothermic/endothermic, Prussia/Russia, hypo/hyperthyroidism, "not X", "X or Y", answer "A",
  accented vs unaccented, shared-answer cards) + topic cases added after SP2; D4 table: 1 test per row (9/9) incl. wrong-then-orb-correct
  -> no promote, ultimate -> no grade change; 5 Leitner transitions + study-ahead when 0 due; >=8 malformed decks rejected (incl. <4
  distinct answers); ID stable across reorder; "5-3" vs "53" distinct IDs; duplicate card -> 1 ID kept; 1 fixed SHA-256 ID golden value;
  top-level-array JSON and a card with a missing/empty front each rejected 2/2; normalize.json fixture N/N; orb trigger: wrong+miss,
  miss+didn't-catch, wrong+wrong each -> orbs 3/3; ultimate charge: orb correct counts 1/1, reset to 0 after firing 1/1, ultimate kills
  add 0 1/1; run loop: 12-card cap 1/1, pools only of size 1-3 1/1, 5th hit ends run 1/1, grades saved before run end 1/1, 2nd hit in
  one encounter removes 0 pips 1/1, first run = 6 cards, not ended at 0 pips and no Overtime 1/1; D19: wave packing 12 -> 4 waves and
  6 -> 2 2/2, last graded wave = one 3-card pool 1/1; grade lock: 2nd scored attempt on a card in one UTC day -> 0 Leitner writes 1/1;
  Overtime answers -> 0 Leitner writes 1/1; win check: 1 card unshown -> no WIN, window accuracy <99% -> no WIN, full coverage +
  >=99% over the window -> WIN, Endless -> no WIN 4/4; deck-lint (Q4): numeric answer rejected, 3-char answer flagged, homophone
  answer without alias flagged 3/3, 3 starter decks pass 3/3; `// Covers: FEAT-ID` above every [TestFixture].
S3 20/20 slashes register per input, hands and controllers 2/2 (slash = fingertip or controller-tip speed >=1.0 m/s through the card
  collider in the strike slot); 0 false triggers in 60 s idle; 5/5 enemies travel wall -> strike slot and no slash registers before arrival.
S4 0 mic opens outside window; 3/3 forced hard STT errors -> orbs <1 s AND next card's voice answer works 3/3; forced 429 -> per-card orbs 1/1; empty transcript -> 0 damage 3/3; 2 non-correct attempts -> orbs 3/3; 6 s silence -> didn't catch 3/3; Wi-Fi off: every card reaches orbs <=4 s after its answer window opens and the run completes 1/1; silent mode not auto-latched by any error except mic denial 1/1.
S5 full run with mic off 1/1.
S6a EditMode: fresh dir first save then load 1/1; corrupt primary -> .bak 1/1; truncated primary + missing .bak -> fresh state 1/1; boxes persist across app restart on device 3/3.
S6 3-card pool with no ultimate needs exactly 3 correct; dodge at >=20 cm lateral/down; lean at telegraph start held through a 2 s telegraph -> dodged 3/3; same with accessibility slow telegraph 3/3; slow 1 s lean -> dodged 3/3; 0 false dodges in 20 forward-lean slashes; recenter + resume then dodge correct 3/3; enemy outside +/-40 deg never starts a telegraph 3/3; hands hidden mid-telegraph -> 0 hits and prompt shown 3/3; telemetry over 1 full run: max head displacement from run start <=30 cm 1/1 and 100% of slash contacts <=0.65 m from the head.
S7 ultimate at exactly 5; 0 ultimate triggers in 60 s of slashing; D15 toggle OFF -> second ultimate type never offered 1/1.
D18 per slice S3-S7: >=1 new tagged scenario 5/5; T1 >=1 screenshot per scenario; affected set for the slice's whole diff (base =
  slice start commit) green at slice close 5/5; per-commit runs affected-only; scenario count never decreases.
D18 T2 (S8 checkpoint, S11): scenarios affected since the last T2 sha green + OVR Metrics fps >= M6 target (60) 1/1 each.
S8 matrix 8/8 (no scene, permission denied, walls only behind, far wall >3.5 m, cluttered room, MRUK timeout, head outside loaded room, recenter after chair turn) -> correct spawn or ring fallback; 100% spawns within +/-35 deg of play-forward at 1.2-3.5 m.
S9 first correct kill <90 s, timed from D16 intro end or skip (2 testers who have not played it; if none by Nov 13, Kev on a fresh
  install, residual logged); 3 runs: graded phase median 4-8 min, max <=10 min, first cleared wave <=2 min 3/3, early-end rate (runs
  ended at 0 pips before Overtime / runs) recorded (Q8); D19 win condition reachable 1/1 (window tuned 60-120 s); Retreat -> mastery
  screen 3/3;
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
D18 premises (SP1/Nov 2 spike): Meta XR plugin release notes state UE 5.7 + simulator support; a simulator session_capture replay
  run exits cleanly; a synthetic room returns MRUK scene data; simulator hand tracking on the chosen device profile; Quest 2
  proximity bypass holds for a full run; OVR Metrics CSV pulled over adb (package name re-checked).
Per slice (FLOW-016): SP1 Meta dashboard versionCode 1 + invite install on non-org account + OVR Metrics. SP2 Wit dashboard (burst
  429s) + dashboard versionCode 2 + invite install + privacy URL HTTP 200. SP2b on-device run only (none external beyond SP2's upload).
  SP3 GitHub Pages/Vercel URL loads on Quest Browser. G0 none. G1 CI gitleaks full-history run green before the public flip. S1
  gitleaks local hook. S2 none. S3 none. S4 Wit dashboard (requests visible, forced-429 run). S5 none. S6a none. S6 none. S7 none. S8
  OVR Metrics CSV (D18 T2). S9 none. S10 Vercel deploy + Firewall/ratelimit log + Upstash usage dashboard (incl. idle-archive
  setting). S11 OVR Metrics (Quest 2; 3/3S waived, A4) + dashboard RC versionCode. S12 invite install on non-org account. S13
  logged-out video playback + Devpost
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
  rating choice (S13, target 10+); Devpost tagline + division field + description + testing instructions sign-off (S13); pre-ruling
  email dropped (G0a); log every judging-period op with timestamp + reason (G0b); after Dec 11
  purge Wit utterance log + Upstash keys; 3 VR check-ins (D18): after the Nov 2 spike, once the core loop works, before submission.
FLAG for Kev: the D18 harness (runner, selector, bypass hook, debug input, event log) is folded into S1, making the Nov 5 AM slice
  heavy; D18 premises (2)-(6) carry agent-chosen fallbacks, not Kev-approved ones. Confirm or re-scope both.

## Open questions

Resolved 2026-10-28 (Kev): ENGINE, Q1-Q12, D15, D19, G0a, G0b in
  [ledgers Resolved decisions](2026-10-28-vr-flashcard-game-ledgers.md#resolved-decisions).
- Open (Kev): should cloud Wit stay the default recognizer? SP2b on-device grammar ASR removes the freeze-unpatchable cloud
  dependency but snaps noise onto deck answers; G1 records freeze resilience in ADR 0002, the call is Kev's (old sheet in ledgers).
