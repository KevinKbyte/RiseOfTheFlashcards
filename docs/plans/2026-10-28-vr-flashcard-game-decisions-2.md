# VR flashcard combat game: design decisions D18-D20
Moved verbatim 2026-10-31 from [2026-10-28-vr-flashcard-game.md](2026-10-28-vr-flashcard-game.md) (500-line cap); the M/A/D/S/Q
IDs cited below live there; ledger IDs in [2026-10-28-vr-flashcard-game-ledgers.md](2026-10-28-vr-flashcard-game-ledgers.md).

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
  per wave (12 -> 4 waves, 6 -> 2); pool size ramps 1 -> 2 -> 3 (M2), attack cadence ramps, last graded wave = one 3-card boss. Overtime waves
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
  the D13 wall queue. Wreckage = the D17 wall-crack persists and grows one tier per wave on MRUK wall planes; ring fallback (D8) = a barricade
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
