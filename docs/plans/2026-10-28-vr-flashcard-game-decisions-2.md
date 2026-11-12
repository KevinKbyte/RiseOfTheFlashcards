# VR flashcard combat game: design decisions D14-D20
Moved verbatim 2026-10-31 from [2026-10-28-vr-flashcard-game.md](2026-10-28-vr-flashcard-game.md) (500-line cap; D18-D20 first, D14-D17 with EN-3); the M/A/D/S/Q
IDs cited below live there; ledger IDs in [2026-10-28-vr-flashcard-game-ledgers.md](2026-10-28-vr-flashcard-game-ledgers.md).

D14 Run loop (finisher-added; rules.md:126,128 "Satisfying in <=10 minutes", bus-stop test; FSRS pass E-FS-6): a run reserves min(12, uncovered
  queue) graded cards at start (uncovered = a today's-queue card with last_review_day < run_day, D5); reserved cards the run never reaches return to
  the queue unspent. Fillers top the run up to 12: cards graded today (lapses first), then introduced not-due cards by lowest retrievability;
  fillers are ungraded (0 FSRS writes, 0 budget), never New, never uncovered queue cards. Cards are packed into enemies of 1, 2 or 3 cards (M2; any
  n 1..12; **Superseded by** D23: stacks of 3, boss 5), graded cards first in queue order, as D19 graded waves, then D19 Overtime.
  Study-ahead removed (it would overrun the daily budget).
  Player has 5 shield pips; a hit removes 1, capped at 1 hit per encounter (Q8); the run ends at 0 pips, on WIN or on Retreat (D19; Endless only at
  0 pips). First run = 6 cards, no-fail (0 pips does not end it), no Overtime: it ends after its graded waves. Every run ends in the mastery screen;
  FSRS ratings are saved per encounter (D5), so an early end loses no progress. Target graded-phase length 4-8 min; Overtime and Endless are
  open-ended. Q8 (2026-10-28): counts (12 cards, 5 pips) stay fixed; pacing (advance speed, attack cadence) is the tuning knob.
  Kev 2026-10-31 (EN-1): D13 creep time (default 8 s, floor 6 s cap + 2 s grading) is the primary pacing knob.
  **Superseded by** EN-2 2026-10-31: the D13 fixed creep speed (0.1875 m/s; reveal -> strike slot >= 8 s) is the primary pacing knob.
D15 Experimental settings pane (Kev, 2026-10-28): one on/off toggle per experimental feature; initially gaze-dwell select of answer
  orbs and menu buttons (1.2 s dwell, Q5) and a second, mastery-unlocked ultimate type (Q9; base build = 1 ultimate type fired
  repeatedly). S9 calibrates each with it on and off; anything that underperforms ships OFF in the submitted build and is not
  mentioned in Devpost or the video.
D16 In-game intro scene (Kev, 2026-10-28): on first launch a virtual phone placed on a detected table surface (MRUK) cracks and sad
  flashcards band together and swarm out, then combat starts; doubles as the trailer breakout shot (rules.md:237, no AI footage). Scope
  ~1 day UE, built in S9. Cuttable: if behind at S12, the skit falls back to paper cards + drawer and the intro is skipped. First
  launch only, <=10 s, skippable by pinch (or any trigger with SX). No-table fallback (D8 ring-fallback triggers, or no qualifying table): the
  phone spawns at waist height ~0.8 m in front of the player, facing them, and the same intro plays.
D17 Onboarding cues, show don't tell (Kev, 2026-10-28; workshop notes show-dont-tell.md + which-cue-when.png, Jelitza): pick the cue
  that answers the player's current question: How? -> ghost hand; What? -> glow + motion; Where? -> signage in the world; names/
  numbers? -> text + a visual. Max 1 active cue at a time; step up with idle time (rim glow -> pulse/bob -> ghost hand); retire each
  cue on success; a hint toggle replays cues. Slash (M1): ghost hand (hand model + handedness; controller ghost = SX, H-1)
  loops a slash through the reach-line card (D13); first run (D14) only; retired at first contact.
  Which enemy (EN-3 (agent default, Kev to confirm)): rim glow on every active advancing enemy; brighter glow hint on the target and on enemies halted at the
  reach line (D13). "rim glow only on the engaged enemy (D13); wall-queued enemies unlit" **Superseded by** EN-3; verbatim in ledgers EN-3. Multi-layer enemies (M2; Kev: "higher level cards
  have multiple layers"): visible card stack, only the top card highlighted/answerable, each correct answer peels one. Answer: D2
  mic-live earcon + pulsing mic glyph on the D13a panel. Silent-mode orbs (M10): all pulse equally on idle, never singling out the correct
  one. Where: wall-crack light at each spawn (M15, D13). Dodge (M3, D7): floor lean-direction marker on the first telegraph of the
  first run; retired after the first dodge. Ultimate (M4, D7 input): palms glow when charged; ghost two-palm-push demo on first charge
  only (controller glow/ghost = SX); Amended 2026-11-07 Kev (H-2): ready-glow on the ultimate orb when charge is full, cleared on firing. Text only for card prompt/answer/numbers, always paired with a glow. Built per slice:
  S3 slash/glow/stack, S4 mic glyph, S5 orbs, S6 dodge marker, S7 ultimate. Cuttable: falls back to the constraint ladder's "tutorial as 3
  prompts" (Must-keep). Open: diegetic wrist-turn UI (pop-up in the hand on a wrist turn) for hints/mastery (Kev's note).
D18 Agent validation loop + reusable E2E suite (Kev, 2026-10-28; M22, M23): the agent plays, sees and fixes the game unattended; Kev
  checks in VR at 3 points only (after the Nov 2 spike, once the core loop works, before submission) for what tooling cannot judge:
  comfort/sickness, slash feel, real hand-tracking accuracy, mic in a noisy room, video sign-off. Debug input layer: console commands
  for slash, dodge, ultimate (input-agnostic event) and "answer <text>" (injects text past the recognizer, so logic is tested without a mic);
  stripped from shipping builds. Structured event log (spawn, hit, layer peel, answer, grade, dodge, pip lost, frame time) is the assertion surface.
  T0 headless logic: UE Automation, `-nullrhi`, seconds, on every change.
  T1 rendered E2E on PC with the Meta XR Simulator (OpenXR runtime, synthetic rooms), before each commit:
    `UnrealEditor-Cmd <proj> -ExecCmds="Automation RunTests <filter>; Quit" -unattended`, real RHI (screenshots need it, never -nullrhi).
    Functional tests save screenshots + the event log; the agent reads the screenshots for visual bugs (missing glow, >1 active D17
    cue, clipping, layout).
  T2 on-device Quest 2, at milestones: Gauntlet `RunUnreal -platform=Android -device=<serial>` (fallback BuildCookRun -deploy -run);
    headset unworn via the proximity bypass `adb shell am broadcast -a com.oculus.vrpowermanager.prox_close` (re-send each run);
    capture with `adb shell screenrecord`/`screencap`; fps via OVR Metrics Tool CSV over adb; asserts M6 fps.
  Selection (M23: affected-only in every tier, no full-run opt-in, path-to-tag map + reference scan, never a
    full-suite fallback) + Enforcement (sole runner script, runner-bypass hook, logged reasons, selector tests; S1 CRITERIA): ledgers MV-9.
  Reusable suite (M23): each mechanic slice S3-S7 adds >=1 scenario built from shared step helpers (start run, spawn card, slash,
    answer, dodge, ultimate); scenario = scripted inputs + event-log asserts + baseline screenshots compared with tolerance. The
    suite never shrinks: a superseded scenario is replaced, not deleted.
  Unverified premises (1)-(6) (UE 5.8 + XR Simulator, replay w/o CLI, synthetic-room MRUK, sim hands, proximity bypass,
    OVR CSV), each a SP1/Nov 2 spike check with a fallback: ledgers MV-2.
D19 Wave survival + win (Kev, 2026-10-28; M24, Q11, Q12; FSRS pass E-FS-6, E-FS-7): per round the player picks deck(s), incl. "all decks" (starter
  decks + non-hidden imports, snapshotted at round start); Endless is an explicit opt-in (default off). Graded waves = the D14 run cards, 3 cards
  per wave (12 -> 4 waves, 6 -> 2); pool size ramps 1 -> 2 -> 3 (M2), attack cadence ramps, last graded wave = one 3-card boss
  (wave packing, pool sizes and boss **Superseded by** D23: stacks of 3, boss 5). Overtime waves
  follow until 0 pips: tonight's misses (not-clean encounters) first, then the D14 filler order, then recycled seen cards; zero FSRS writes
  (ungraded relearn, D5); each wave faster. Encounter result (computed, never written): clean = its first scored attempt would rate Good under D4
  (voice correct with only Didn't catch before it, or a silent-mode first-pick orb); not clean = any other scored end; excluded = any Hard STT error
  in it (never counted). WIN (checked after every answer; never in Endless) has two tiers (Kev "Two tiers (Recommended)"); each needs coverage
  first, then a stretch after coverage (Kev #1, E-K-b2): >=90 s unpaused (window tuned 60-120 s in S9) holding >=4 counted (clean or not-clean)
  encounters, all clean (99% under 100 encounters = 0 not clean).
  - Tier 1 "Day cleared": today's queue for the selection is non-empty and every queue card has last_review_day == run_day (counted across today's
    runs); the mastery screen shows "today: k/n faced" and any over-limit backlog.
  - Tier 2 "Deck conquered" (M24 literal): the selection has 0 New and 0 due cards; that run serves the lowest-retrievability cards (min 6,
    ungraded), coverage = each of them faced this run.
  Any other empty queue = practice run, no WIN (blocks a free WIN at limits 0). Endless: neither tier; ends only at 0 pips. Retreat any time ->
  mastery screen. Mastery screen: waves survived, tier won, personal best per (mode, selection) in the D5 save, next-due count worded "next
  uprising: N cards" (rolls at the local 04:00 study-day boundary, D5). Grade lock: D5. First run (D14) stays 6 cards, no-fail, no Overtime. Horde =
  the deck queue beyond maxActive, not yet spawned (D13, EN-3 (agent default, Kev to confirm); "the D13 wall queue" **Superseded by** EN-3;
  maxActive is 1 under D23). Wreckage = the D17 wall-crack persists and grows one tier per wave on MRUK wall planes; ring fallback (D8) = a barricade
  taking the same tiers; decal count capped, checked at S11 >=60 fps. Built: S2 packing + budget + queue + grade lock + Overtime + win check, S6 run
  end, S6a mastery fields + PB save, S8 wreckage + barricade, S9 deck select + limit steppers + Endless + Retreat + window tuning, S11 decal cap.
D20 Quest 3S compatibility (Kev 2026-10-28 "yes add the 3S compat decision to the plan", ledgers E-K-d): Quest 2 baseline, Quest 3S compatible, one
  APK; each rule cites a source or says UNVERIFIED. Hardware: 3S = XR2 Gen 2 / 8 GB vs Quest 2 XR2 Gen 1 / 6 GB, same 1832x1920 per eye (UNVERIFIED,
  third-party: https://roadtovr.com/quest-3s-quest-3-quest-2-specs-compared/). Manifest: com.oculus.supportedDevices = quest2|quest3|quest3s
  (https://developers.meta.com/horizon/resources/publish-mobile-manifest/), set in UE Project Settings > Platforms > Meta XR > Mobile > "Supported
  Meta Quest devices" (https://developers.meta.com/horizon/documentation/unreal/os-compatibility-mode/); S1 checks the generated manifest lists
  quest3s (older plugins may omit it; an unlisted device runs in OS compatibility mode as an older model). Input: hands only (H-1);
  controller rules (Touch / Touch Plus profiles, GetControllerType) moved verbatim to ledgers H-1, applied only in SX. Capabilities:
  3S-only features (colour passthrough, Environment Depth, scene) gated by runtime capability checks with Quest 2 fallbacks, never by model string;
  UOculusXRFunctionLibrary::GetDeviceType() for diagnostics only, never android.os.Build.MODEL
  (https://developers.meta.com/horizon/documentation/unreal/unreal-set-get-device-type/); Environment Depth on 3S profiles per
  https://developers.meta.com/horizon/documentation/unreal/xrsim-intro/ ; OpenXR extension names UNVERIFIED; the game uses no 3S-only feature today.
  Display: query supported refresh rates/resolution at runtime, never assume Quest 2 values; 3S lists 72/90/120 Hz
  (https://www.meta.com/quest/quest-3s/); API route XR_FB_display_refresh_rate UNVERIFIED. Hand tracking parity Quest 2 vs 3S: UNVERIFIED. Testing:
  Meta XR Simulator has a Quest 3S device profile (xrsim-intro); its UE 5.8 support UNVERIFIED = D18 premise check (7) in SP1; Devpost testing notes
  carry a 3S smoke checklist (S13); store review per declared device UNVERIFIED (only VRC.Quest.Packaging manifest checks found). Residual: real-3S
  frame time and comfort unprovable without a device (A4).
D21 Fixed enemy fan (Kev 2026-11-11, "Fixed fan"; amends the D13 park position and spec ENC-001 / CARDS-010): an enemy that reaches the
  player no longer parks at its spawn bearing on the ~0.6 m reach line; it parks in one of three fixed slots at -35 / 0 / +35 deg on a hold
  line 0.7 m from the player. The fan is anchored to the head position and facing captured when the first enemy of a non-empty field
  arrives, and stays put until the field is empty (it does not follow later head turns). Slot 0 is on the player's right at yaw 0. Enemy face
  is 0.40 m wide; slot centres sit ~0.42 m apart (0.7 m chord at 35 deg), so neighbours stay >= 0.40 m apart. A hand slash still picks an
  enemy (slash radius 0.20 m). The D8 15 deg minimum gap still governs SPAWN bearings on the walls; only the parked position changes.
  Why: at 0.6 m with spawn bearings only 15 deg apart, faces sat 0.16 m apart, merged into one panel and covered the question panel (D13a).
  Open question (Kev): the D13 strike slot (0.5 m default, calibrated 0.40-0.60 m, Q8) lies inside the 0.7 m hold line. Does a revealed
  enemy leave its fan slot to creep to the strike slot, or does the strike slot move to the hold line (which changes the D13 creep speed
  formula (2.0 - 0.5) m / 8 s)? Closed 2026-11-11 (Kev, "Strike from 0.7 m (Recommended)"): a revealed enemy strikes from its fan slot on
  the 0.7 m hold line and never leaves it; strike slot = that fan slot. Creep still takes 8 s: speed = (2.0 - 0.7) m / 8 s = 0.1625 m/s.
  D13 strike slot 0.5 m and creep (2.0 - 0.5) m / 8 s = 0.1875 m/s **Superseded by** this. Why: the logic crept 0.7 -> 0.5 m while the
  view held the enemy at 0.7 m (an invisible ~1.07 s stall); staying in the slot keeps faces off neighbours and the question panel.
  Rejected: move in to 0.5 m (overlap, comfort minimum, new view path); 0.7 m plus a ~0.15 m visual lunge (extra overlap and code).
  Q8 per-player strike-slot calibration 0.40-0.60 m (S9) **Superseded by** a per-player hold-line calibration, ~0.6-0.8 m, moving the fan
  and the strike together (range needs Kev's confirmation). Open (headset check): A15 seated reach ~0.4-0.65 m vs the 0.7 m hold line.
  "~0.6-0.8 m" (range needs Kev's confirmation) **Superseded by** D22 (0.67-0.8 m).
D22 Hold range, glow frame, ultimate orb placement (Kev 2026-11-11, after an adversary review; amends D21 and spec ENC-002 / ENC-003):
  (1) Per-player hold-line calibration range 0.67-0.8 m; default stays 0.7 m. Why: adjacent fan slots (35 deg apart) sit
  2R*sin(17.5 deg) ~ 0.60R apart, so R >= 0.67 m keeps neighbours >= 0.40 m apart (D21, ENC-001). Open (headset check): the 0.8 m end,
  with enemy faces raised 0.25 m (ENC-003). (2) Enemy glow frame padding `HALO_PAD` 0.18 -> 0.10 m. Why: keeps the halted side enemy's
  glow inside the Quest 3 horizontal view (54.5 vs 57.6 deg) and widens the side glow-to-panel gap from ~2.5 to ~6 deg. (3) Ultimate orb
  moves beyond the hold line to ~(0.42, -0.34, -0.94) m from the eye in the head-yaw frame (~1.03 m out, just right of the question
  panel), positioned from the panel anchor. Why: at eye + (0.35, -0.2, -0.45) it sat on the pointing line from a lap-rest hand to the
  right-side enemy and swallowed the press. Palm push and grip squeeze do not depend on the orb position; the uncharged orb stays a
  selectable no-op (D17 / H-2 unchanged).
D23 One stack at a time, stun then slash (Kev 2026-11-12, after an adversary review; amends D13, D4, D14, D19, D21 and spec ENC-001 /
  ENC-002 / ENC-006 / CARDS-010). Kev: "multiple cards fight as one, and indicates how many lives it has before it falls. So it does slow
  mo attack at user and if user doesnt answer correctly in time they get damaged. if they answer correctly in time they deal dmg to the
  cards, and one of the cards fall". Picked: "One stack at a time", "3 cards, boss 5", "Answer, then slash to finish".
  (1) One enemy active at a time, in the centre (0 deg) fan slot; the next walks in only after the current one falls. D13 / CARDS-010
  "up to maxActive (default 3) ... the player picks the target" **Superseded by** this; the D21 side slots stay written but the default run
  does not use them. Why: crowding, and the "stolen slash" (a walking-in enemy passed 0.145-0.281 m from a parked one; slash spheres
  0.20 m). Rejected: keep 3 enemies + a 0.40 m slash filter (hidden rule, clutter stays; remains the fallback); one enemy for the whole
  run (monotone).
  (2) Stack sizes: regular 3 cards, final enemy (boss) 5. Packing N run cards: N >= 8 -> last stack 5, rest in 3s; N < 8 -> no boss,
  stacks of 3. Leftover 1 joins the last regular stack (4); leftover 2 is its own stack, placed first. Examples: 12 -> 3,4,5;
  13 -> 2,3,3,5; 11 -> 3,3,5; 8 -> 3,5; 7 -> 3,4; 20 -> 3,3,3,3,3,5. D14 "enemies of 1, 2 or 3 cards" and D19 "pool size ramps
  1 -> 2 -> 3 ... last graded wave = one 3-card boss" **Superseded by** this.
  (3) The enemy shows its top card by itself when it parks at the hold line; an early slash still reveals it. After a card falls the
  next card shows by itself.
  (4) A correct answer in time stuns the enemy: attack timer stops, no strike, no time limit. Any slash (hand, controller swing, trigger
  fallback; S3b) then knocks the top card off: lives -1, next card shows, or the enemy falls on its last card. A slash on a revealed,
  not stunned enemy does nothing. The ultimate does not finish a stunned card. D13 "a correct answer ... peels a card" and "re-slash
  after a miss ... re-opens the answer window" **Superseded by** this.
  (5) Grading unchanged (D4, D5), written at the answer, not the slash: correct in time = Good; wrong or late (strike lands) = Again
  once per card plus player damage.
  (6) Lives: `Cards <remaining>/<total>` on the active enemy plus one card drawn per remaining card.
  Wind-up 2 s and creep 8 s unchanged, pending the headset check.
  CRITERIA (pre-code): packing N = 1..20 20/20 incl. the 6 examples; 1 active enemy, next walks in only after it falls 3/3; parked
  enemy shows its top card with no input 3/3; correct -> stunned, 0 strikes in 30 s 3/3; slash on stunned -> lives -1 + next card
  shown 3/3; last card -> enemy falls 3/3; slash on revealed, not stunned -> no change 3/3; ultimate on stunned -> 0 cards removed
  1/1; FSRS write at the answer, 0 at the slash 3/3; `Cards r/t` label and r drawn cards correct after each fall 3/3.
  SIGNALS: headset check of the 2 s / 8 s timings.

## UE spike debug checklist (SP-DBG)
Kev 2026-11-07; spike repo C:/Users/Kev/ue-spike/MetaXRSpike.
- Black/odd desktop render: first load /Engine/Maps/Templates/Template_Default; a WorldGrid checker on your mesh = DefaultMaterial fallback
  (RendererSettings cvars ruled out for this spike; see spike README.md "Known issue: desktop `-game` preview shows the default checker"),
  not lighting/capture.
- Verify a test method on a control (blank project) before trusting a negative result.
