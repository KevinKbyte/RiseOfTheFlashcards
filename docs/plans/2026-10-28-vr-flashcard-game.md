# VR flashcard combat game: build plan (Meta VR Start 2026, Gaming / New Experience)
Date: 2026-10-28. Status: hardened by /super-plan (2 adversary rounds + finisher). Source: offload run vr-flashcard-superplan-20261028-075442.
GOAL: judged Quest 3/3S build (dev + test on Quest 2 only, A4 waiver; residuals A4-R1..R4); seated player slashes card-enemies by
  hand, answers by voice or silent orbs; live in "Competition" channel by Nov 18 12:00 PT, unchanged to ~Dec 11. Success = Devpost
  submitted + invite URL installs on a non-org account + >=60 fps on device (Quest 2; 3/3S unmeasured, A4-R1) + voice answer works
  after a fresh invite-URL install. Decision: stack at gate G1 (Nov 3, off the MemriPal Nov 4 deadline).
Out of scope: multiplayer, LLM grading beyond D3a (Kev 2026-10-31), MemriPal or realm-of-recall code/assets (recon R19), VR (non-passthrough) arena,
  post-Dec-11 MemriPal import (separate branch, never the judged channel).
Facts: R1-R20 in [2026-10-28-vr-flashcard-recon.md](2026-10-28-vr-flashcard-recon.md).
Kev decisions 2026-10-28: ENGINE (Unreal, spike-gated; D1; 5.8 per Kev 10-30, A2), Q1, Q2, Q4-Q12, G0a, G0b, new D15, D19 (Open questions + ledgers).
Changes from v1 (finisher -> round 2 -> round 1) + sources re-checked: [ledgers](2026-10-28-vr-flashcard-game-ledgers.md) MV-1.

## Must-keep (Kev verbatim asks; never defer/cut/descope without Kev's explicit ask)
M1 Enemies are flash cards; slash by hand (H-1; controller slash = optional stretch SX), then say the answer aloud; correct = damage.
M2 Bigger enemies = multi-card health pools.
M3 Enemies attack; player dodges (lean/duck).
M4 Ultimates unlocked after N correct answers.
M5 Gaming track, New Experience division (G0a 2026-10-28: claim kept with D11 disclosure; Devpost division field final at S13).
M6 Hands = sole required input, controllers optional stretch SX (H-1, supersedes Q12; rules.md:88,112,114); seated, 2 ft (design
  limit <=30 cm head/hand radius satisfies both rules.md:122 radius and guidelines.md:47 diameter readings); judged on Quest 3/3S; >=60 fps.
M7 Deadline Nov 18 12:00 PT; build live + unchanged to ~Dec 11.
M8 Full-time VR from Nov 5; before Nov 4 only spikes.
  Kev 2026-10-31: early start approved for engine-neutral core logic (S2 matcher fixtures) and an IWSDK flashcard prototype.
M9 Speech recognition in headset (on-device only, D2; Web Speech API rejected per MemriPal ADR 0008).
M10 Silent mode (slash answer orbs) for bus-stop test + accessibility.
M11 Deck input: bundled starter decks + companion paste page with pairing code.
M12 Deterministic fuzzy answer matcher with aliases, always first; "no LLM grading" amended by Kev 2026-10-31 to hybrid D3a (ledgers C-1):
  "both, live can be toggled in the settings". Slash kept, point-to-select rejected ("slash feels better"; M1 unchanged, never re-propose).
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
Kev answers 2026-10-28 (FSRS pass; not M-items; ledgers E-K-a, E-K-b1..E-K-b3, E-K-e): "Any input pauses (Recommended)" (D7); "it should be
  following fsrs principles (so we can do something similar to anki where we set the number of cards for a day)" (D5); "#1 - yeah otherwise user can
  cheese it and dodge for 1-2 minutes after doing one correct" (D19); "ultimates can push cards further away, so yuo have more time to answer it"
  (D4); "Two tiers (Recommended)" (D19); "12 new / 120 reviews (Recommended)" (D5); "Again / Hard / Good (Recommended)" (D4, D5).
Scope constraint ladder (fidelity, not features) if behind at the Nov 12 checkpoint: 2 starter decks instead of 3 (floor 2: M11 says "decks", plural;
  cut Basic Science first, Q4); D15 experimental features cut (base build already has 1 ultimate type fired repeatedly, Q9); placeholder VFX/audio;
  mastery screen as text list; tutorial as 3 prompts; imported-deck list capped at 1 slot (still with delete confirm + Undo). Never drop an M-item.

## Assumptions
A1 Before Nov 5 only spikes, no game code. Honest budget: ~14 h Kev time Oct 28-Nov 3 (SP1 ~7 h, SP2 ~5 h, G0/G1 + 3 ADRs ~2 h); MemriPal has priority. Overflow rule: G1 takes its default (see G1) and any unfinished SP1 step runs Nov 5 AM before S1.
  Kev 2026-10-31: early start approved for engine-neutral core logic (S2 matcher fixtures) and an IWSDK flashcard prototype.
A2 UE 5.8.0 (Kev 2026-10-30, verbatim: "we have UE5.8 installed, lets use that"; was 5.7) at C:/Program Files/Epic Games/UE_5.8
  (CL53629095), no install needed: its Engine/Config/Android/Android_SDK.json pins NDK 27.2.12479018 (r27c); JDK 21 (Android Studio
  JBR 21.0.5), SDK platforms 33-36, build-tools 34-36 present. Meta XR plugins v207 (ISDK v207 supports 5.7/5.8), never vendored;
  MetaXRPlatform plugin OFF (crash report). Risk: prebuilt v207 OculusXR/OculusInteraction/MetaXRHaptics fail to load on 5.8 (open Meta investigation https://developers.meta.com/horizon/feedback/vr/investigations/1053459897316880/) -> UE-spike step 1 builds the MetaXR plugin from source in the project's Plugins/ against 5.8, not committed (VS 2022 present; 30-60 min compile check).
  Source build fails -> UE 5.7.4 + core MetaXR v205.0 (tag oculus-5.7.4-release-1.205.0) + ISDK v207.0 (needs a 5.7 install; C: ~84 GB
  free); 5.8 assets do not open in 5.7, so settle the fallback before authoring content. Spike fails outright -> Unity fallback: Unity
  6.3 LTS (6.2 out of support; AIO v207 min 6000.0.66f2) + Meta XR All-in-One at the version hackathon.md:63 names ("v81+ (v207)"),
  via UPM registry, never vendored; Android module installable (R18: missing). Resolved plugin/SDK versions: ADR 0001, checked in S1.
A3 Spike premise (Nov 2, D2): p50 on-device transcription latency on Quest <= 1000 ms (p95 <= 1500 ms, >= 90% match), end of speech
  -> text, 1-4 word answers (unverified; SP2 measures each engine; Quest 2 is the only device in hand, A4). Was Wit cloud: ledgers V-1.
A4 WAIVED 2026-10-28 (Kev, verbatim: "i am not going to buy quest 3/3s, just going to use quest 2"). Quest 2 is the dev device and
  the only test device; the former "Quest 3/3S test required before S12" step runs on Quest 2. The UE spike's Nov 1 device need is met
  by the Quest 2 in hand. Judges still play on Quest 3/3S (M6), so each gap is logged residual risk, not a blocker: A4-R1 perf,
  A4-R2 scene, A4-R3 FoV, A4-R4 footage; detail in ledgers MV-4.
A5 Quest 2 passthrough + manual Space Setup is a dev stand-in for MRUK, not evidence of judge-room behaviour (S8 matrix covers the
  gap). With no 3/3S (A4 waiver) it is also the only test rig: S8 runs on Quest 2; 3/3S colour passthrough + Space Setup stays
  residual A4-R2. On-device capture of passthrough is unverified (SP1 checks it). IWSDK prototype passthrough switch: D8 (EN-3).
A6 Repo (MIT) on a private GitHub remote with CI gitleaks from 2026-10-28; flipped public at G1 (Q2); privacy page + relay on
  Vercel free tier until Dec 11.
A7 Video public (rules.md:141) on a new YouTube channel for the game, not Kev's personal channel (Q1; M17 still never links that one).
A8 Judges likely play bundled starter decks; the relay is still shipped (M11) and must fail soft.
A9 Group workshops/office hours are not 1:1 mentorship (R9).
A10 Starter decks Kev-authored, no identifiable people or brands (R12). Q4 (2026-10-28): Opposites (warm-up), World Capitals (no
  disputed capitals; aliases e.g. Kyiv/Kiev), Basic Science (element names with one-word English answers, e.g. "Fe" -> "iron"); no
  Spanish. Topics locked by Oct 30 (SP2 recordings use real answers). Lint gate in S2.
A11 Plan uses the recognizer's top hypothesis only (D3). Wit single-hypothesis premise **Superseded by** D2.
A12 Quest 3S horizontal FoV ~96 deg, Quest 3 ~110 deg (recalled, not cited); D8 arc sized under both with margin; S11 verifies on
  Quest 2 only (A4 waiver; Quest 2 FoV differs again, residual A4-R3).
A13 **Superseded by** D2 (public Wit client token; no STT secret ships on-device). Ledgers V-1.
A14 EditMode tests run on Mono in the Editor; the device runs IL2CPP with managed stripping. String.Normalize(FormKD) and char.GetUnicodeCategory on IL2CPP/Android are unverified (normalization tables may be stripped or unsupported), so EditMode green does not prove device matcher behaviour (S4 on-device self-test).
  Under Unreal (2026-10-28): A14 is N/A (C++ on desktop and device); kept for the Unity fallback.
A15 Seated hand reach: a slash within the 30 cm hand radius only reaches ~0.4-0.65 m in front of the head; enemies at the 1.2-3.5 m wall spawn are out of reach until they advance (D13).
  Resolved 2026-10-31 (Kev, EN-1): slash at the D13 reach line (~0.6 m), then knockback + creep to the 0.5 m strike slot.
  **Superseded by** EN-2 (Kev 2026-10-31): reveal (select/slash) works at any distance; the reach line only halts an unrevealed enemy (D13).
A16 **Superseded by** D2 (Wit per-app limits vs judge concurrency; on-device has no shared quota). Ledgers V-1.

## Design decisions
D1 ENGINE (Kev 2026-10-28; dual-track 2026-10-29, ledgers E-K-c, E-IW): THIS repo is the Unreal build: UE 5.8 + Meta XR plugins v207
  (A2), gated by the UE spike (SP1 + SP2 on UE) passing by Nov 2; spike fails -> Unity 6.3 LTS and the Unity plan (rubric names
  ISDK/MRUK, R5); ADR 0001 records Unreal (spike-gated) vs Unity fallback (M13). Unity-only slice terms
  (asmdef, EditMode, [TestFixture], TMP, JsonUtility, UPM, IL2CPP) apply to the Unity fallback; under Unreal they map to UE equivalents,
  slice scope and CRITERIA unchanged. No engine switch after Nov 4 (see G1 post-gate failure rule). In parallel, sibling repo
  meta-vr-start-dev-2026/game-iwsdk (scaffolded 2026-10-29, dbe2f34, @iwsdk/create 1.1.0-rc.2, VR/TS, no locomotion/grab/physics) holds
  an agent-built IWSDK (WebXR) build. A ~1-day IWSDK device spike (UNVERIFIED: getUserMedia mic in an immersive session, Quest 2 hand
  tracking, offline persistence, fps), plus the UE spike (SP1/SP2), decides WHICH BUILD IS JUDGED at G1 (Nov 3): one Entry per
  person (rules.md:56) and Devpost takes ONE link, the Competition channel (APK) OR the GitHub page (IWSDK) (rules.md:140), so
  both cannot be judged (ledgers E-D1-1). IWSDK is accepted by hosted URL (hackathon.md:73-74); prize eligibility is engine-neutral
  (guidelines.md:53). The IWSDK build ships voice OFF by default (D2), so it ships without M9 (ledgers E-D1-2). hackathon.md:64 suggests UE 5.8 (suggested, not required); plan uses 5.8 (Kev 2026-10-30, A2).
D2 STT ON-DEVICE ONLY (Kev 2026-10-30 "sherpa-onnx default (Recommended)", after a 3-adversary round; ledgers V-1), behind
  IAnswerRecognizer. Default = sherpa-onnx grammar/keyword recognizer constrained to the card's expected answers (deck answers + aliases
  + [unk]). The Nov 2 spike (SP2) also measures Whisper tiny.en q8_0 (Runtime Speech Recognizer, Fab, paid), promoted only if it meets
  the A3 premise on Quest. Neither passes -> silent orbs default (M10 no-mic path). Never cloud STT or audio upload; D3a is text-only (Wit
  dropped, V-1). IWSDK build: voice OFF by default until a spike proves getUserMedia inside an immersive session; transformers.js Whisper
  only if its WebGPU path hits p50 <= 1500 ms. Risks (V-1): Whisper hallucination on silence/1 s clips; inference vs frame pacing (no
  Quest 2 benchmark); open-source UE whisper plugin archived.
  Mic opens at slash contact; an earcon plays only once the mic is live; SP2 measures first-word clipping. Answer window = from earcon
  until the recognizer's end-of-speech, capped at 6 s with no speech start (cap -> "didn't catch"); the mic is closed outside it.
  The window runs while the enemy creeps (D13); creep time >= 6 s cap + 2 s grading timeout, so a silent window closes before arrival. Mic is
  re-acquired on app focus/resume (Unity: OnApplicationPause/Focus; Unreal: the engine's app-lifecycle events), never assumed live.
D3 Matcher (deterministic, no LLM). Normalize: NFKD, drop combining marks (Unicode Mn), lowercase, strip punctuation, collapse whitespace, strip a leading article (a/an/the) only if the remainder is non-empty. Candidates = distinct normalized answer+alias strings across the deck, each mapped to the set of cards that own it. Correct: exact match to a candidate owned by this card; or fuzzy: both strings >=4 normalized chars, ratio = 1 - lev(a,b)/max(len a, len b) >= 0.85, first 4 normalized chars identical, nearest candidate owned by this card, margin >= 0.1 over the best candidate not owned by this card. Wrong: same rules resolve to a candidate not owned by this card; or exact hit on the card's `reject` list; or hedge guard (transcript contains "or"/"and" token absent from the answer). Everything else non-empty = miss. Negation guard dropped (prefix rule blocks leading "not/no/never"; ratio blocks the rest). No number-word conversion; top hypothesis only.
D3a Claude (Kev 2026-10-31, M12, ledgers C-1; contract spec GRADE-001..008, RELAY-013/014). Load-time: deck POST adds Claude aliases + rejects
  (starter decks once offline, committed); play stays deterministic + offline. Live: Settings toggle, upgrade-only (D4 Grading), free-form
  recognizer only, default OFF unless G1 picks Whisper; Haiku dev/test, Sonnet judged. Built: S10 ~0.5 slice-day; live S10+S4 ~1-1.5, Nov 16 buffer.
D4 Answer outcomes (single table; "encounter" = one card-enemy's card until it is removed; one FSRS write per encounter, rated per D5):

| Outcome | Classified when | Enemy | Player | FSRS rating (D5) |
|---|---|---|---|---|
| Voice correct | D3 correct | -1 card | none | Good if first scored attempt with only Didn't catch before it; Hard after a miss; none if Again was already written |
| Voice wrong | D3 wrong | none | hit | Again (written at once) if first scored attempt; else none |
| Voice miss | non-empty, not correct/wrong (ratio, margin, prefix, length fails) | none | none | none; caps a later correct at Hard; counts toward 2-attempt orb trigger |
| Grading (D3a toggle ON) | D3 miss on a free-form transcript, never empty/[unk] | advance/creep (D13) + attack timer frozen | none | Claude correct -> Voice correct row; wrong/error/2 s timeout/offline -> Voice miss row (orb trigger unchanged) |
| Didn't catch | empty transcript or 6 s cap | none | none | none; counts toward 2-attempt orb trigger |
| Arrived unanswered (D13) | creeping enemy reaches the strike slot with no correct answer yet | 2 s telegraph, then knockback + creep repeat | hit (dodgeable, D7; 1-hit cap, D14) | none; the window's own row rates it; arrival adds no orb-trigger attempt |
| Hard STT error | error callback or no final transcript 3 s after end of speech | none | none | none (a Hard-STT-only encounter writes nothing; card stays due/uncovered); orbs immediately for THIS card only; next card tries voice again |
| Orb correct (voice mode, after misses/errors) | slash correct orb | -1 card | none | Hard if a miss or Didn't catch preceded and no Again was written; else none |
| Orb correct (silent mode, first pick) | slash correct orb | -1 card | none | Good (Q3) |
| Orb wrong | slash distractor | none | hit | Again if first scored attempt; picked orb removed |
| Ultimate (knockback) | ultimate fires (D7 input) | strike-slot enemy pushed back toward its wall spawn (max to wall/ring); its in-flight attack cancelled (the only allowed cancel), telegraph reset; 0 cards removed; a creeping (D13) enemy is pushed the same way, panel kept, creep resumes from there | none | none; encounter state kept (hit cap, attempt + orb counters, strike-slot reservation); an open mic window is left alone |

D4 EN-2 (2026-10-31): Arrived unanswered applies only to a revealed enemy (D13); its knockback goes to 2 m. An unrevealed enemy halts at
  the reach line and never telegraphs. Voice outcomes classify in any revealed phase (creep, telegraph, after knockback).
Orbs = 1 correct + 3 distractors drawn from distinct normalized answers not owned by this card (deck validation guarantees >=4 distinct answers). Silent mode: user toggle any time; latches automatically ONLY on mic permission denial.
Orb trigger: any 2 non-correct voice attempts in one encounter (wrong, miss, didn't catch, in any mix) -> orbs for this card; a player who keeps saying wrong answers is never stuck taking hits. Each voice attempt needs a fresh slash on the same card.
Ultimate charge: +1 per correct outcome (voice or orb, assisted or not); firing the ultimate resets charge to 0.
D5 SR = FSRS-6 (Kev 2026-10-28; ledgers E-FS-1..E-FS-8): 21 default weights, desired retention 0.90, no optimizer, fuzz OFF (D18), no learning steps,
  interval = clamp(round(S),1,365) whole study days. Engine-free C++ Core module (~70-300 LOC) hand-ported from py-fsrs (MIT; CREDITS); golden vectors
  from a pinned py-fsrs script under tests/fixtures (own test + README entry) live in THIS repo as the source of truth; the IWSDK repo (D1) runs
  ts-fsrs 6.0.0 against them (FSRS-6 21 weights + fuzz-off UNVERIFIED). Rating per D4, one write per encounter, Easy never emitted (recognizer latency
  confounds speed); unresolved at run end = Again if orbs were shown, else no write. Study day = local 04:00 rollover (Anki-style); run_day frozen at
  run start; due iff due_day <= run_day AND last_review_day < run_day. Grade lock: max 1 FSRS write per card per study day, queue cards only; Overtime
  misses-first = ungraded relearn. Budget (Anki-style; S9 steppers; default 12 new / 120 reviews): global {new_today, reviews_today} across
  selections, so switching decks cannot multiply it; edits apply next study day; new/day >=1 while any New card remains; New stops once the review cap
  is hit. Today's queue = snapshot on the day's first run per selection under {run_day, selection hash}: due cards by lowest retrievability (up to the
  review cap), then New in deck order (up to the remaining new allowance). Armor tier = stability bins (<1, <3, <7, <21, >=21 d), visual only. Card ID
  = lowercase hex of the first 16 bytes of SHA-256 over UTF-8 of (NFC, trimmed, whitespace-collapsed front + U+001F + back) (never string.GetHashCode;
  no punctuation strip, so "5-3" != "53"); parser keeps the first of any duplicate ID and reports the count; editing a card's text makes it a new card
  by design. Save = one JSON in persistentDataPath with per-card {S, D, state, due_day, last_review_day, reps, lapses}, daily counters, queue
  snapshot, run_day: write temp + flush; if primary missing -> File.Move(temp, primary), else File.Replace(temp, primary, .bak); load order primary ->
  .bak -> fresh state. Deck schema root = {"version":1,"title":...,"cards":[{"front","back","aliases":[],"reject":[]}]}; Core (C++ parser) holds all
  validation (caps, required non-empty fields, >=4 distinct answers, duplicate IDs) and rejects top-level arrays and missing/empty required fields.
  Unity-fallback JsonUtility / Game.Json adapter detail: ledgers MV-6.
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
  manual step). Nov 18-Dec 11 allowed ops are ONLY {RELAY_ENABLED flip off, GRADER_ENABLED flip off (D3a), byte-identical privacy-page
  redeploy}; no code changes. Each op is logged with timestamp + reason, and the policy is disclosed in the Devpost testing instructions.
D7 Dodge + interruptions (Kev 2026-10-28 "Any input pauses (Recommended)", ledgers E-K-a): baseline = mean head position over the 1.5 s before
  telegraph onset, FROZEN from onset until the attack resolves (overlapping attacks share the earliest frozen baseline until all resolve);
  the D13a panel anchors to this baseline, so a dodge never moves the panel; the
  baseline rolls only outside attack windows. Dodge = lateral or downward displacement >=20 cm from the frozen baseline at the hit frame; forward
  lean ignored; all motion within 30 cm radius. "Lateral or downward displacement" = Euclidean distance in the head-local lateral/vertical plane
  (forward axis dropped). Interruptions (input-loss pause, system/menu pause, recenter) never cancel an attack: attack timers freeze and no hit
  lands; on the first resume all frozen attacks take one fresh shared baseline (1.5 s) and each replays its full telegraph once. A replay runs on
  through input loss and lands at its hit frame; a menu pause or recenter during a replay freezes it, re-takes the baseline, then resumes the
  remaining telegraph (no second replay). Input-loss pause: no hand tracked for >0.5 s -> "show your hands" prompt; resumes when a hand is
  tracked (controller poses count only with SX enabled, H-1); never touches the mic or an open answer window. A system/menu pause during
  an open answer window closes the mic and discards the in-flight recognition: speech already started -> Voice wrong (D4 rating and orb
  trigger), no hit; no speech yet -> Didn't catch. Ultimate (charge >=5): two-palm push (both palms face forward and move forward >=X cm
  in <0.3 s; X tuned in S7); controller mappings (A+X, one-controller A/X hold) **Superseded by** H-1, moved to SX. Armed = charged with
  both palms facing forward; while armed, a slash event waits <=0.3 s and is dropped only if the push fires. Accessibility toggle: slower
  telegraphs + auto-dodge option.
D8 MR only. Play-forward yaw = tracking-space forward, recomputed on every recenter. Enemies emerge from MRUK walls 1.2-3.5 m away
  within +/-35 deg of play-forward (70 deg arc). An enemy's card text shows and its telegraph starts only while it is within +/-40 deg of
  current head yaw; otherwise its attack timer waits. Q5 (2026-10-28): this in-view gate is the head-gaze mechanic (rules.md:223), named
  as such in ADR 0001 and Devpost; gaze-dwell select is a D15 experimental toggle. Ring fallback (2.5 m, same arc, still passthrough)
  if: no scene, permission denied, MRUK timeout (5 s), no qualifying wall, or head outside the loaded room (MRUK current room null /
  point not in room).
  Prototype (EN-3; Kev 2026-10-31: "shouldnt the cards be coming out of the walls and everything via passthrough? is it not possible
  in quest 2"): the IWSDK build (D1) currently runs immersive-vr with sceneUnderstanding off; next slice switches it to immersive-ar
  passthrough + plane detection for wall spawns. Quest 2: grayscale passthrough, walls only from the user's manual Space Setup (A5);
  ring fallback otherwise. On-device check: probe row f (device-spike ar-probe).
D9 CREDITS.md from first commit; README credits GitHub KevinKbyte only, never the YouTube channel.
D10 Secrets + signing: no STT secret ships (on-device, D2; Wit token handling **Superseded by** D2, ledgers V-1). gitleaks local
  pre-commit hook from S1 with a canary check; CI gitleaks on the private GitHub remote from 2026-10-28 (Q2). Release keystore created in
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
D13 Engagement distance = "slash, pop-out, creep" (Kev 2026-10-31, ledgers EN-1; resolves A15). Kev: "how about the cards come in, you
  slash one and the cards show up on the screen, with partial seethrough, so that user can see the cards better, but they can also see
  the card enemy coming towards them so they have to answer it quickly". An enemy emerges at its wall spawn (D8, 1.2-3.5 m, keeps M15),
  advances along its spawn bearing toward a reach line ~0.6 m in front of the play-forward head (inside A15), inside the +/-35 deg arc.
  Reveal (EN-2, Kev 2026-10-31: "once the user clicks on the card no matter how far it is we can start to answer") = select or slash
  (M1) the card-enemy at ANY distance -> card pops out (D13a) + mic opens (D2). An unrevealed enemy halts at the reach line.
  After reveal it keeps coming, slower, no reset: revealed inside 2 m -> knocked back to 2 m (D4 Ultimate knockback mechanics);
  otherwise it continues from where it is. Creep speed fixed = (2.0 - 0.5) m / 8 s = 0.1875 m/s toward the strike slot 0.5 m in front
  of the head, so reveal -> strike slot >= 8 s (>= 6 s no-speech cap + 2 s grading timeout, D2, D3a); earlier reveal = more time.
  Speed is the pacing knob (D14, Q8); needs one tune on Quest 3/3S. Grading (D3a) freezes the creep.
  Telegraphs and attacks happen only in the strike slot: arrived unanswered -> 2 s telegraph -> hit (D4 row) -> knockback to 2 m, repeat.
  A correct answer in any revealed phase (creep, telegraph, after knockback) shatters the panel and peels a card, with a short sound
  and a hand/controller haptic where available: feedback on EVERY correct answer (EN-3, Kev: "every time the user hits a card
  successfully (answers it successfully), there should be some feedback"); a multi-card enemy
  (M2) is knocked back per card by the reveal rule (to 2 m only if inside 2 m). Re-slash after a miss or Didn't catch (re-opens the
  answer window) is valid at any distance. Optional later: speed bonus by kill distance.
  Q8 (2026-10-28): 0.5 m is the default; the slot is calibrated per player within 0.40-0.60 m (S9).
  Wave + choose target (EN-3, Kev 2026-10-31: "there should be multiple cards coming at the user, and user gets to choose which card to
  attack first"): up to maxActive (default 3; tuning knob like the D14 speed) card-enemies advance at once, each from its own D8 wall
  spawn (ring fallback). Unrevealed ones halt at the reach line and never attack. The player picks the target: reveal any one at any
  distance (EN-2 rules apply to it). Exactly one revealed at a time (the voice-answer target); selecting another while one is revealed
  is ignored until that one resolves. Others keep advancing while you answer; Grading (D3a) freezes only the target. A correct answer
  defeats the target and the deck refills active up to maxActive. Deck cleared = deck empty and 0 active enemies. Multi-card enemies
  (M2) unchanged. "Max 1 engaged enemy (revealed, or halted at the reach line) at a time; others queue at their walls"
  **Superseded by** EN-3; verbatim in ledgers EN-3.
  Old wording (finisher, slash + attack both in the strike slot, card text for 0.5 m) **Superseded** 2026-10-31; verbatim in ledgers EN-1.
  EN-1 wording (slash only at the reach line, always knocked back to ~2 m, creep time default 8 s) **Superseded by** EN-2 2026-10-31;
  verbatim in ledgers EN-2.
D13a Card panel (Kev 2026-10-31, EN-1; picked over "Stop + countdown ring" and head-locked "Stuck to screen"): on reveal (D13, EN-2;
  "on slash" **Superseded by** EN-2) the card face
  pops out as a semi-transparent panel (~70% opaque, dark backing), world/body-locked, never head-locked (comfort; would hide the enemy);
  ~1.0 m away, ~15 deg below eye line, yaw-only lazy-follow with ~20 deg dead zone, anchored to the D7 baseline; offset so it never
  hides the engaged enemy's approach. Card text sized for the panel at ~1 m, not 0.5 m; S11 checks it at Quest 2 and Quest 3S FoV.
  Prototype: game-iwsdk proto/flashcards test page gets this loop now for an on-device try before G1 (Nov 3); S3 (Nov 6) builds it.
  Risks (EN-1): untested on device; per-card recoil may read as stalling; follow-panel comfort; plan churn before G1.
  "untested on device" **Superseded by** EN-2: first on-device run (Quest 2) 2026-10-31; panel readability unchanged (stays at ~1 m).
  Enemy look (Kev 2026-10-31, EN-2: "cartoonise the cards (add faces to them), since they're rising against the human"): each
  card-enemy shows a cartoon face (eyes + mouth, angry/mischievous) on its player-facing side; the face is not the card face, so the
  prompt text stays hidden until reveal. Theme: cards rising against the human.
D14-D20 (run loop, experimental pane, intro scene, onboarding cues, agent validation loop + E2E, wave survival + win, Quest 3S
  compatibility): moved verbatim 2026-10-31 to [2026-10-28-vr-flashcard-game-decisions-2.md](2026-10-28-vr-flashcard-game-decisions-2.md)
  (500-line cap; D14-D17 moved with EN-3); IDs unchanged.

## Slices
UE spike (Kev, 2026-10-28; D1): SP1 + SP2 run on UE 5.8 + Meta XR 207 source-built (A2; MetaXRPlatform OFF) with on-device voice (D2); pass = SP1
  + SP2 CRITERIA by Nov 2; fail -> Unity 6.3 LTS. Setup present (A2); step 1 = MetaXR source build (A2). SP1 also creates a second (backup) Meta
  dashboard app (Q7). SP2 second speaker = Kev + several TTS voices/accents (Q6); residual (TTS cleaner than real speech) in ADR 0002.
SP1 Oct 28-Nov 1 (~7 h): Android toolchain (UE: NDK r27c + JDK; Unity fallback: Android module); Quest 2 dev mode; release keystore
  + 2 backups; versionCode build script; hello-hands+passthrough APK release-signed; Meta dashboard app + Competition channel; upload
  versionCode 1; invite URL install on a non-org account with App Sharing off; 10 s on-device capture shows the passthrough room. Kev
  checks whether Devpost has a judges-only field for the invite URL. D18 premise checks (1)-(6) + (7) (D20), each with its fallback.
SP2 Oct 30-Nov 2 (~5 h), DEPENDS SP1 (Android toolchain + signed pipeline): starter-deck answers locked by Oct 30 (Q4 topics,
  A10; answers <4 normalized chars flagged and measured in the corpus); privacy page stub deployed (needed before a mic-permission
  upload); on-device voice spike on the deck-derived corpus: sherpa-onnx grammar (default) + Whisper tiny.en q8_0 (candidate), D2,
  each against the A3 premise, OVR Metrics frame times logged during inference;
  spike built release-config (IL2CPP ARM64, final stripping level + link.xml, final permission set RECORD_AUDIO/USE_SCENE/INTERNET),
  signed with the restored keystore, uploaded as versionCode 2, installed via invite URL; v2 also runs a 10-case normalization
  self-test from tests/fixtures/normalize.json on device (A14; fail -> Core uses a hand-rolled Latin fold table instead of
  String.Normalize, decided at G1). SP2b **Superseded by** D2 (on-device is now SP2's default).
SP3 (IWSDK + vosk-browser, HELD Q10) overtaken by D1 dual-track 2026-10-29 (ledgers MV-7).
G0 resolved 2026-10-28 (Kev). G0a: New Experience claim (M5) kept with the D11 disclosure, re-assignment risk (rules.md:90-92) seen;
  the division field is set at S13 (editable until Nov 18 12:00 PT, guidelines.md:101). G0b: freeze policy per D6.
G1 Nov 3: default = Unreal 5.8 (5.7.4 fallback, A2) if the UE spike passed by Nov 2, else Unity 6.3 LTS (D1); recognizer per D2
  (sherpa-onnx; Whisper only if it passed; neither -> silent orbs default). Unmeasured numbers do not block: default holds,
  unfinished SP1/SP2 checks run Nov 5 AM before S1 and must pass before S3. Repo flips public
  (Q2) only once a full-history gitleaks scan is green and .gitignore covers .claude/; else it stays private. ADRs 0001 (engine + SDK
  versions + head-gaze mechanic per D8/Q5), 0002 (on-device STT per D2: engine, spike numbers,
  Wit dropped and why, false-accept residual; replaces the cloud-vs-on-device freeze-resilience row, V-1), 0003 (provenance).
Post-G1 failure rule (Nov 5 AM overflow checks): no engine switch after Nov 4. The G1 recognizer fails a Nov 5 check -> the other D2
  engine if it passed SP2, else silent orbs default (D2); never a cloud fallback (slip charged to the Nov 16 buffer). Invite-URL pipeline
  fails on Nov 5 -> build continues in the G1 engine (Unreal if the spike passed, else Unity), Kev escalates to Meta support + forum
  the same day, and the pipeline check repeats daily until green; still red on Nov 8 -> Kev decides (Q7; backup dashboard app, SP1).
S1 Nov 5 AM scaffold in the G1 engine. UE 5.8 (default): Meta XR v207 source-built (version check), MetaXRPlatform plugin OFF, Android
  NDK r27c + JDK, Core C++ module with no engine-module dependencies (D5). Unity 6.3 LTS (fallback): URP mobile, AIO SDK via UPM
  (version check), Core asmdef noEngineReferences + Game.Json adapter asmdef (D5). Both: git-lfs, .gitignore (keystores,
  Builds/, *.apk, *.aab; UE Binaries/ Intermediate/ Saved/ DerivedDataCache/; Unity Library/ Temp/), gitleaks hook +
  canary script, CREDITS/README/CHANGELOG, spec file .claude/spec-cache/game/references/spec.md with FEAT IDs, shared
  tests/fixtures/normalize.json, credits audit script (lists non-code files under the engine asset root, Content/ or Assets/, missing
  from CREDITS.md; exit 1 on any; own test + README entry), headless test runner script (UE Automation tests; Unity: batchmode
  EditMode) = the D18 runner (T0/T1, affected selector + path-to-tag map + reference scan, run log), D18 runner-bypass hook, debug
  input layer, event log, first scenario (start run) (versionCode script already exists from SP1).
S2 Nov 5 PM core logic (may spill to Nov 6 AM; slip charged to the Nov 16 buffer): deck parser (JsonUtility, stable IDs, duplicate-ID drop, caps,
  >=4 distinct answers, reject list), matcher (D3), outcome table (D4) + orb trigger + ultimate charge, FSRS-6 + daily budget + today's queue (D5;
  ~3-4 h over Leitner, plus S9 steppers ~1 h and S6a fields ~0.5 h: ~0.5 day against the Nov 16 buffer), run loop (D14), combat rules. Deck-lint
  gate (Q4): numeric answers rejected; answers <4 normalized chars flagged (exact-match only under D3) for SP2 measurement; homophone answers need
  an alias (e.g. sun/son).
S3 Nov 6 slash + card enemy (wall emerge -> reveal at any distance, unrevealed halts at reach line -> D13a panel -> fixed-speed creep,
  knockback to 2 m only if inside 2 m -> strike slot, D13) + cartoon enemy face (D13a) + answer window + damage + D17 cues + D18
  scenario. Pre-G1 IWSDK prototype of the same loop: D13a. EN-1 "reach line -> slash knockback" **Superseded by** EN-2.
  Real hand swing gesture at a distance: later slice (reveal by select works now).
  EN-3: multi-enemy wave (maxActive 3) + choose target + correct-answer sound/haptic feedback (D13).
S4 Nov 7 voice via IAnswerRecognizer + D4 outcomes (per-card fallback, 3 s timeout) + earcon + mic re-acquire on resume + D17 cue + D18 scenario.
S5 Nov 8 silent orbs + toggle + D17 cue + D18 scenario.
S6a Nov 9 (half day, MemriPal finals) FSRS persistence (D5 save: card state, daily counters, queue snapshot, run_day) + on-device golden vectors +
  EditMode save tests + mastery screen.
S6 Nov 10 health pools, telegraphed attacks (in-view gate), dodge (frozen baseline), input-loss pause + interruption replay (D7), shield pips + run
  end (D14), accessibility toggle + D17 cue + D18 scenario.
S7 Nov 11 ultimates (charge >=5; two-palm push, D7; knockback, D4; 1 type, Q9) + experimental second,
  mastery-unlocked ultimate type behind its D15 toggle + D17 cue + D18 scenario.
SX OPTIONAL STRETCH, controllers (H-1; no date): only after hands-only S1-S7 pass their CRITERIA; never blocks S8-S13; cut first.
  Controller slash (controller-tip), A+X ultimate, one-controller A/X hold (SIG-1), controller pose in the input-loss pause, controller
  ghost + glow cues (D17), Touch / Touch Plus profiles (D20); detail + criteria verbatim in ledgers H-1.
S8 Nov 12 MR walls + arc + fallback + test matrix. CHECKPOINT Nov 12 evening: D18 T2 run; apply constraint ladder if any of S1-S8 open.
S9 Nov 13 first-five-minutes tutorial (incl. per-player strike-slot calibration, D13), pause/resume (voice re-arm), accessibility pass, D5
  daily-limit steppers on deck select, D15 Experimental pane + gaze-dwell select, on/off calibration of each D15 toggle, D16 phone-breakout intro
  (cuttable).
S10 Nov 14 relay (D6) + automated function tests + headset pairing + imported-deck list + privacy policy final; relay circuit
  breaker (G0b); Upstash idle-archive check (free database must not be archived while idle through Dec 11).
S11 Nov 15 perf + polish + CREDITS audit (script) + device test on Quest 2 (incl. FoV at the arc edge and the D13a panel; re-scoped from Quest 3/3S
  by the A4 waiver, so the Nov 1 / Nov 15 3/3S device dates are void and S8 walls run on Quest 2; residuals A4-R1..R3) + D18 T2 run + RC upload.
S12 Nov 16 buffer + RC invite install verify + fresh-install save check + video capture (D12).
S13 Nov 17 video review + Devpost (rules.md:139-144,155; hackathon.md:80: tagline (140 chars), track Gaming, division (New Experience
  per G0a unless re-ruled; editable until Nov 18 12:00 PT, guidelines.md:101), invite URL (judges-only field if one exists), video link,
  text description with inspiration / how built / future plans / target launch date, D11 paragraph, testing instructions incl. the G0b
  freeze-ops disclosure, screenshots; content rating per rules.md:154, target 10+); submit by 21:00 PT. Nov 18 bugfix-only, no uploads after 08:00 PT.
F Nov 18-Dec 11 freeze; weekly checks, each with its action:
  relay round-trip (fail -> check quota, flip RELAY_ENABLED off if abused); privacy URL 200 (fail -> byte-identical redeploy of the
  static page); channel install (fail -> contact Meta support). Every relay/privacy op logged with timestamp + reason (G0b, D6). After
  Dec 11: Kev purges the Upstash keys per the privacy policy retention.

## Evaluation criteria (CRITERIA, countable, pre-code)
SP1 (on Quest 2, A4) release-signed install via invite URL on non-org account 1/1; versionCode 1 accepted 1/1; hands 2/2; passthrough
  on; >=72 fps empty scene; 10 s capture shows room 1/1 (fail -> plan XR Simulator room footage before S12; the Quest 3 option is
  dropped by the A4 waiver, residual A4-R4).
SP2 corpus = real deck answers, Kev + several TTS voices/accents as the second speaker (Q6; residual: TTS cleaner than real speech,
  logged in ADR 0002): >=27/30 correct accepts; >=15 wrong-answer/noise utterances with 0 false accepts; A3 premise per engine; >=15 incl. 1 s silent clips (V-1);
  Whisper promoted only if it meets every bar, neither -> silent orbs default (D2); 0 first-word clips/30 (clip = transcript lacks the scripted first word); 0 crashes/30;  v2 (release config, final permissions, restored keystore) accepted 1/1; after invite install, 1 voice answer transcribed + 1
  MRUK room query returns 1/1; on-device normalization self-test 10/10 (or Latin-fold fallback chosen at G1); privacy URL 200.
SP2b **Superseded by** D2 (bars now SP2's, per engine).
G0 Kev decisions recorded 2026-10-28 (G0a claim kept, G0b allowed-ops list) 2/2. G1 stack recorded with which SP numbers it rests on;
  ADRs 0001-0003 written; ADR 0002 records D2 spike numbers + Wit-drop rationale 1/1; ADR 0001 names the D8 in-view gate as the head-gaze mechanic 1/1;
  public flip only after full-history gitleaks exit 0 AND `git check-ignore .claude/` exit 0 (2/2), else repo stays private.
S1 headless test runner exit 0 (UE Automation; Unity: EditMode); 0 vendored Meta SDK sources in the repo; resolved Meta XR version
  recorded and matches hackathon.md:63 v207 (UE: .uplugin VersionName, 5.7.4 fallback core v205.0; Unity: AIO/ISDK in Packages/packages-lock.json); UE
  only: MetaXRPlatform plugin disabled in the .uproject 1/1; gitleaks exit 0 on full history AND canary (fake API-key token in a
  scratch engine config file, never committed) -> exit 1; git check-ignore 5/5 (x.keystore, x.jks, Builds/x, x.apk,
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
  (afferent/efferent, hypertonic/hypotonic, exothermic/endothermic, Prussia/Russia, hypo/hyperthyroidism, "not X", "X or Y", answer "A", accented vs
  unaccented, shared-answer cards) + topic cases added after SP2; D4 table: 1 test per row (11/11) incl. wrong-then-orb-correct -> 1 write (Again)
  1/1, knockback -> 0 cards removed and no rating 1/1; FSRS golden vectors from the pinned py-fsrs script N/N (S and D within tolerance, interval
  days exact; same vectors on device in S6a); rating map: Good, Hard, Again, Hard-STT-only -> no write, Didn't-catch-only -> no write, unresolved
  with orbs shown -> Again 6/6; rollover: 03:59 and 04:01 local -> different study days 1/1, run_day frozen across a mid-run rollover 1/1; budget:
  switching selections never exceeds the global 12/120 1/1, limit edit applies next study day 1/1, new/day >=1 while New remains 1/1, New stops at
  the review cap 1/1; queue snapshot reused by a 2nd run the same day 1/1; empty queue (not Tier 2) -> practice run, no WIN 1/1; >=8 malformed decks
  rejected (incl. <4 distinct answers); ID stable across reorder; "5-3" vs "53" distinct IDs; duplicate card -> 1 ID kept; 1 fixed SHA-256 ID golden
  value; top-level-array JSON and a card with a missing/empty front each rejected 2/2; normalize.json fixture N/N; orb trigger: wrong+miss,
  miss+didn't-catch, wrong+wrong each -> orbs 3/3; ultimate charge: orb correct counts 1/1, reset to 0 after firing 1/1; run loop: 12-card cap 1/1,
  reserve = min(12, uncovered queue) and unreached reserved cards stay unspent 1/1, fillers 0 FSRS writes and never New 1/1, pools only of size 1-3
  1/1, 5th hit ends run 1/1, ratings saved before run end 1/1, 2nd hit in one encounter removes 0 pips 1/1, first run = 6 cards, not ended at 0 pips
  and no Overtime 1/1; D19: wave packing n = 1..12 12/12 incl. 12 -> 4 waves and 6 -> 2, last graded wave = one 3-card pool 1/1; grade lock: 2nd
  scored attempt on a card in one study day -> 0 FSRS writes 1/1; Overtime answers -> 0 FSRS writes 1/1; win check: 1 queue card unfaced today -> no
  WIN, 1 not-clean encounter in the window -> no WIN, coverage + full clean window -> Day cleared, 0 New + 0 due + same -> Deck conquered, Endless
  -> no WIN 5/5; WIN floor: 0 or 3 counted encounters -> no WIN 2/2, 1 answer after a 90 s pause with a not-clean encounter in the 90 s of play
  before the pause -> no WIN 1/1 (E-N2), all-Hard-STT window -> no WIN 1/1, silent-mode first-pick orbs -> WIN reachable 1/1, orb after 2 silences
  -> not clean 1/1, hidden deck -> 0 of its cards in an all-decks round 1/1, PB kept per (mode, selection) 2/2; deck-lint (Q4): numeric answer
  rejected, 3-char answer flagged, homophone answer without alias flagged 3/3, 3 starter decks pass 3/3; `// Covers: FEAT-ID` above every
  [TestFixture].
S3 20/20 slashes register with hands, 2/2 hands (slash = fingertip speed >=1.0 m/s through the card
  collider at the D13 reach line); 0 false triggers in 60 s idle; 5/5 unrevealed enemies travel wall -> reach line and halt there;
  EN-2: select reveals at 3 m, 1.5 m and the reach line 3/3 each, panel shown on reveal; reveal at 3 m -> 0 forward jump, creeps on
  from 3 m 3/3; reveal inside 2 m -> knockback to 2 m 3/3; creep speed 0.1875 m/s (+/-5%) and reveal -> strike slot >= 8 s 5/5;
  re-slash after a miss at > 2 m re-opens the window 3/3; correct while creeping at > 2 m clears 3/3; enemy face visible, prompt
  hidden before reveal 5/5; arrived unanswered -> 2 s telegraph then hit then knockback to 2 m 3/3;
  correct during the telegraph -> panel shattered, 0 hits 3/3; 2-card enemy -> knockback per card 2/2; panel never occludes the enemy 5/5.
  EN-3: 3 enemies advance at once, each from its own spawn 3/3; select a 2nd while one is revealed -> ignored 3/3; non-targets keep
  advancing during the answer window and Grading 3/3; correct -> active refilled to maxActive 3/3; deck empty + 0 active -> deck
  cleared 1/1; every correct answer -> visible + sound + haptic (where available) 5/5.
  EN-1 "5/5 enemies travel wall -> reach line and no slash registers before arrival", "slash -> knockback to ~2 m + panel shown 5/5",
  "creep to strike slot >= 8 s 5/5" **Superseded by** EN-2.
S4 0 mic opens outside window; 3/3 forced hard STT errors -> orbs <1 s AND next card's voice answer works 3/3; empty transcript -> 0 damage 3/3; 2 non-correct attempts -> orbs 3/3; 6 s silence -> didn't catch 3/3; Wi-Fi off: voice answers still graded 3/3 and the run completes 1/1; silent mode not auto-latched by any error except mic denial 1/1.
S5 full run with mic off 1/1.
S6a EditMode: fresh dir first save then load 1/1; corrupt primary -> .bak 1/1; truncated primary + missing .bak -> fresh state 1/1; FSRS card state,
  daily counters and queue snapshot persist across app restart on device 3/3; FSRS golden vectors on device N/N.
S6 3-card pool with no ultimate needs exactly 3 correct; dodge at >=20 cm lateral/down; lean at telegraph start held through a 2 s telegraph -> dodged
  3/3; same with accessibility slow telegraph 3/3; slow 1 s lean -> dodged 3/3; 0 false dodges in 20 forward-lean slashes; recenter + resume then
  dodge correct 3/3; enemy outside +/-40 deg never starts a telegraph 3/3; no hand tracked mid-telegraph -> prompt, freeze, fresh baseline, one
  replay, lands at its hit frame 3/3; hide again during the replay -> still lands 3/3; menu pause and recenter mid-telegraph -> same rule 2/2;
  recenter or 20 cm re-seat during a pause or replay -> 0 auto-dodges 3/3; 2 overlapping frozen attacks -> each replays once 2/2; hands hidden during
  an answer window -> answer graded normally 3/3; menu pause mid-speech -> mic closed, recognition discarded, rated as Voice wrong (D4), 0 pips lost
  3/3, before speech -> Didn't catch 3/3; telemetry over 1 full run: max head displacement from run start <=30 cm 1/1 and 100% of slash contacts
  <=0.65 m from the head.
S7 ultimate at exactly 5; 6th correct while charged -> ultimate still fires 1/1; two-palm push -> ultimate 3/3 and 0 slash events; charged, palms
  forward, one-hand slash -> registers 3/3; uncharged two-palm push -> 0 3/3; 0 ultimate triggers in 60 s of charged slashing (hands) 1/1;
  knockback: strike-slot enemy pushed back toward its wall spawn, its in-flight attack cancelled, 0 cards removed, hit cap + attempt/orb
  counters held, open mic window untouched 3/3; charge 0 after firing 1/1; D15 toggle OFF -> second ultimate type never offered 1/1; judge
  test (rules.md:114): full run, intro to mastery screen, with no controller ever paired 1/1. SX CRITERIA: ledgers H-1.
D18 per slice S3-S7: >=1 new tagged scenario 5/5; T1 >=1 screenshot per scenario; affected set for the slice's whole diff (base =
  slice start commit) green at slice close 5/5; per-commit runs affected-only; scenario count never decreases.
D18 T2 (S8 checkpoint, S11): scenarios affected since the last T2 sha green + OVR Metrics fps >= M6 target (60) 1/1 each.
S8 matrix 8/8 (no scene, permission denied, walls only behind, far wall >3.5 m, cluttered room, MRUK timeout, head outside loaded room, recenter after chair turn) -> correct spawn or ring fallback; 100% spawns within +/-35 deg of play-forward at 1.2-3.5 m.
S9 first correct kill <90 s, timed from D16 intro end or skip (2 testers who have not played it; if none by Nov 13, Kev on a fresh install, residual
  logged); 3 runs: graded phase median 4-8 min, max <=10 min, first cleared wave <=2 min 3/3, early-end rate (runs ended at 0 pips before Overtime /
  runs) recorded (Q8); D19 WIN on a starter deck: 3 runs, time-to-WIN recorded 3/3; 0/3 WIN or median >15 min -> window 60 s, re-run (E-FIN-15);
  daily-limit steppers change new/reviews, applied next study day 1/1; Retreat -> mastery screen 3/3;
  pause/resume 3/3 AND voice answer works after resume 3/3; system menu open/close then voice works 3/3; cold start <10 s; strike slot
  calibrates within 0.40-0.60 m 3/3; gaze-dwell ON: 1.2 s dwell selects 3/3, shorter glance selects 0/3;
  Experimental pane lists 2/2 toggles, each flips live and persists across restart 2/2; each toggle run on and off against these S9
  metrics with the result logged 2/2; every underperformer is OFF in the RC build and absent from Devpost + video (D15).
S10 round-trip 3/3 (headset shows code, page posts, deck in headset <=5 s after POST); oversize/malformed/<4-answers/expired/
  reused-code rejected 5/5; concurrent double GET -> exactly 1 gets deck 1/1; 11th POST in 60 s from one IP -> 429 1/1; relay function
  automated tests exit 0 with `// Covers:` tags and normalize.json fixture N/N in JS; RELAY_ENABLED=false -> 503 and headset shows
  "import unavailable" 1/1; relay unreachable -> headset circuit breaker shows "import unavailable" with no manual step 1/1; Upstash
  free-tier idle-archive policy checked and the database stays active idle through Dec 11 1/1; 0 Upstash token hits in built page
  bundle (grep); rich-text tags rendered literal 1/1; deck delete needs confirm and Undo restores 1/1; privacy page lists 7/7 (voice
  audio on-device only, transcripts to Anthropic only with D3a live grading on, rate-limit IP keys with TTL, function logs without bodies,
  deck 15-min storage + deck text to Anthropic at import, scene data stays on device, deletion contact); D3a: GRADER_ENABLED=false -> /grade
  503 + deck stored unaugmented 2/2; stub Claude wrong/error/timeout -> miss 3/3; 0 ANTHROPIC_API_KEY hits in page bundle 1/1.
S11 median >=72 fps, 1% low >=60 over 5 min Quest 2; Quest 3/3S run waived 2026-10-28 (A4), residual A4-R1 logged 1/1; on Quest 2:
  card text + telegraph readable at arc edge 1/1 (judge-FoV residual A4-R3); D13a panel text readable at ~1 m and enemy approach
  unoccluded at Quest 2 FoV and Quest 3S FoV (~96 deg, A12; simulated, A4-R3) 2/2; credits audit script exit 0 (0 uncredited assets);
  on-device normalization self-test 10/10 on the RC build; RC build registers 0 debug commands 1/1 (E-SEC-4); RC upload accepted.
S12 RC invite install non-org account 1/1; cold launch 3/3; fresh install -> answer 3 cards -> relaunch -> FSRS card state persists 1/1; voice
  answer after fresh install 1/1.
S13 video <180 s public logged-out; frame review 0 hits (people, logos, brands, screens, photos); Devpost "submitted" with D11
  paragraph; Devpost fields 9/9 (tagline <=140 chars, track Gaming, division set per G0a, invite URL, public video link, description
  incl. inspiration/how built/future plans/target launch date, testing instructions incl. mic + scene permission prompts, silent-mode
  toggle and G0b freeze-ops disclosure, >=3 screenshots passing frame review, content rating recorded).

## External signals (SIGNALS)
OVR Metrics on device; Meta dashboard channel status + versionCode; invite URL on non-org account; Vercel deploy + Firewall/ratelimit
  logs; Upstash usage dashboard; gitleaks local hook + CI on the private GitHub remote (Q2); logged-out video playback; Devpost page.
D18 premises (SP1/Nov 2 spike): ledgers MV-3.
Per slice (FLOW-016): SP1 Meta dashboard versionCode 1 + invite install on non-org account + OVR Metrics. SP2 OVR Metrics (inference frame times) + dashboard
  versionCode 2 + invite install + privacy URL HTTP 200. SP2b superseded (D2). G0 none. G1 CI gitleaks
  full-history run green before the public flip. S1 gitleaks local hook. S2 none. S3 none. S4 none. S5
  none. S6a none. S6 none. S7 none. SX SIG-1 (hands + controllers reported at once? Meta docs; ledgers H-1). S8 OVR Metrics CSV (D18 T2). S9
  none. S10 Vercel deploy + Firewall/ratelimit log + Upstash usage dashboard (incl. idle-archive setting). S11 OVR Metrics (Quest 2; 3/3S waived,
  A4) + dashboard RC versionCode. S12 invite install on non-org account. S13 logged-out video playback + Devpost "submitted" page. F
  Upstash dashboard, privacy URL, channel install.

## Blast radius / rollback
Missed deadline = no entry (submit early; pipeline proven in SP1/SP2 with a release-config build). Frozen bug unfixable (bugfix window, T-4h no uploads). On-device recognizer error or timeout in judging -> per-card orbs, voice retried every card; spike fail -> silent orbs default (D2). Relay abused or down (incl. GET flood draining Upstash/Vercel quotas, no GET limit by design) -> RELAY_ENABLED off, starter decks work. IL2CPP normalization missing on device -> Latin fold table (caught in SP2, not S11). Lost keystore -> 2 backups (restore proven in SP2). One commit per slice; channel keeps prior build.

## Rejected alternatives
Moved to ledgers MV-5 2026-10-29 (FSRS now adopted in D5; Leitner rejected; SM-2 still rejected).

## Kev-only manual actions
Moved to ledgers MV-10 2026-10-29. FLAG for Kev (still open): S1 carries the whole D18 harness, and D18 premises
  (2)-(6) carry agent-chosen fallbacks; confirm or re-scope both (ledgers MV-11).

## Open questions

Resolved 2026-10-28 (Kev): ENGINE, Q1-Q12, D15, D19, G0a, G0b in
  [ledgers Resolved decisions](2026-10-28-vr-flashcard-game-ledgers.md#resolved-decisions).
- Resolved 2026-10-30 (Kev): cloud Wit default -> on-device only (D2, ledgers V-1).
- Resolved 2026-10-31 (Kev): hands = sole required input, controllers = optional stretch SX; Q12 **Superseded by** H-1 (ledgers H-1).
- Resolved 2026-10-31 (Kev): encounter = slash at reach line, pop-out panel, creep to strike slot (D13, D13a; ledgers EN-1).
  "slash at reach line" **Superseded by** EN-2: reveal at any distance, fixed-speed creep, cartoon enemy faces (D13, D13a).
- Resolved 2026-10-31 (Kev, EN-2): "after a miss the enemy is out of reach, so the re-slash point is undefined" -> re-slash valid at any
  distance (D13).
- Resolved 2026-10-31 (Kev, EN-3): multi-enemy wave + choose target, feedback on every correct answer (D13); prototype passthrough
  wall spawns via immersive-ar + plane detection (D8).

## Adversarial cheat sheet
- Primary technical risk: big decks and one-correct WINs; grades or WINs given for nothing (deck-switch budget, empty queue, paused window).
- Fix: FSRS-6 daily queue (global 12/120 budget, local 04:00 day); WIN = coverage, then >=90 s unpaused with >=4 clean; knockback removes 0 cards.
- Lingering doubt: hand-ported FSRS float drift (x86 vs ARM) and 21 untuned weights; S2 desktop and S6a device golden vectors are the first check.
