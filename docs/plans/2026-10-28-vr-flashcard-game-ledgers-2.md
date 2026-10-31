# VR flashcard combat game: plan ledgers (continued)
Continues [2026-10-28-vr-flashcard-game-ledgers.md](2026-10-28-vr-flashcard-game-ledgers.md) (500-line cap); the M/A/D/S IDs cited
below live in [2026-10-28-vr-flashcard-game.md](2026-10-28-vr-flashcard-game.md).

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

## Hands-only decision 2026-10-31 (H-1)
- H-1 Kev 2026-10-31, verbatim: "hackathon says controllers should be optional so let's focus on no controller and then optionally based on
  user discretion they can use controller". Rules: rules.md:88 Gaming "hands-first (required) ... without controllers"; rules.md:112
  "Fully usable with hands end-to-end. Controller support optional."; rules.md:114 judge test (complete without ever pairing a
  controller); rules.md:325 Best First Five Minutes "teaches controller-free interaction". Hands = sole required input in every
  mechanic, criterion and tutorial cue; plan S7 adds the no-controller judge test.
  Superseded: Q12; D7 controller mappings and controller pose in the input-loss pause; E-K-a / E-FIN-6 / E-FIN-7 controller parts;
  D17 controller ghost + glow; D20 controller profiles; S3/S6/S7 controller CRITERIA; S6 SIG-1. All re-homed below as plan slice SX.
- SX OPTIONAL STRETCH (post-S7; only after hands-only S1-S7 pass their CRITERIA; never blocks S8-S13; cut first). Moved verbatim:

| From | Re-homed controller text (verbatim) |
|---|---|
| M1 | slash with hand or controller (Q12) |
| D7 pause | Input-loss pause: no hand and no controller pose tracked for >0.5 s -> "show your hands" prompt; resumes when any pose is tracked (SX enabled only) |
| D7 ultimate | controllers = press A+X together; one controller + one hand = hold that controller's A or X for 0.5 s (SIG-1) |
| D16 | skippable by any trigger or pinch |
| D17 slash | ghost of the player's input (controller model on controllers; hand model + handedness when hand-tracked) |
| D17 ultimate | palms or controllers glow when charged; ghost demo of the player's input on first charge only |
| D20 input | Input: OpenXR actions on the classic Touch profile /interaction_profiles/oculus/touch_controller, never device-specific; runtime type via UOculusXRFunctionLibrary::GetControllerType() (https://developers.meta.com/horizon/documentation/unreal/unreal-touch-controller/); Touch Plus profile /interaction_profiles/meta/touch_controller_plus (XR_META_touch_controller_plus) and classic-binding fallback on 3S UNVERIFIED. |
| S7 slice | ultimates (charge >=5; two-palm push, A+X, or one-controller A/X hold, D7) |
| S3 CRITERIA | 20/20 slashes register per input, hands and controllers 2/2 (slash = fingertip or controller-tip speed >=1.0 m/s through the card collider in the strike slot) |
| S6 CRITERIA | no pose tracked mid-telegraph -> prompt, freeze, fresh baseline, one replay, lands at its hit frame 3/3 per input (hands, controllers); controller-only run -> attacks land 3/3 |
| S7 CRITERIA | A+X charged -> ultimate 3/3, uncharged -> 0 3/3; one controller + one hand, 0.5 s A/X hold -> ultimate 3/3 (only if SIG-1 shows mixed input); 0 ultimate triggers in 60 s of charged slashing, hands and controllers 2/2 |
| SX CRITERIA | S1-S7 hands-only CRITERIA still pass with SX on 1/1; full run with no controller paired still passes 1/1 |
| SIGNALS | S6 SIG-1 (Meta docs: do Quest 2/3 report hands and controllers at once? check before S6) -> now before SX |
## Claude grading decision 2026-10-31 (C-1)
- C-1 Kev 2026-10-31, verbatim: "we have 200$ claude API credits so we can hit claude so that it verifies what user said is correct"; "yeah we
  can send to haiku for testing, and sonnet for demo"; "both, live can be toggled in the settings"; "slash feels better" (point-to-select rejected).
  Plan M12 amended (not dropped), D3a, D4 Grading row, D6 freeze ops; spec GRADE-001..008, RELAY-013/014. After correctness/failure/simplicity rounds.

## Encounter flow decision 2026-10-31 (EN-1)
- EN-1 Kev 2026-10-31 after testing a static prototype, verbatim: "it doesnt play as I thought it sohuld play following the storyline that
  we had planned where the cards come towards the player. Maybe it's harder for the user to see what is on it though when it's moving
  towards you"; then "how about the cards come in, you slash one and the cards show up on the screen, with partial seethrough, so that
  user can see the cards better, but they can also see the card enemy coming towards them so they have to answer it quickly".
  After 3 adversarial reviews, options: (1) "Pop-out panel" (PICKED); (2) "Stop + countdown ring"; (3) "Stuck to screen" (head-locked;
  rejected: comfort, hides the enemy). Plan D13, D13a, A15, D2, D4 (Arrived unanswered row, Grading freezes creep, Ultimate on a creeping
  enemy), D7, D14, D17, S3, S11; spec ENC-001..006, GRADE-004 amended.
  Residual risks: untested on device; per-card recoil may read as stalling; follow-panel comfort; plan churn before G1.
  Superseded D13 wording (verbatim): D13 Engagement distance (finisher-added; resolves A15): an enemy emerges at its wall spawn (D8,
  1.2-3.5 m, keeps M15), then advances along its spawn bearing to a strike slot 0.5 m in front of the play-forward head position, inside
  the +/-35 deg arc; slash contact, telegraphs and attacks happen only in the strike slot. Q8 (2026-10-28): 0.5 m is the default; the slot
  is calibrated per player within 0.40-0.60 m (S9). Max 1 enemy in the strike slot at a time; others queue at their walls. Card text
  sized for 0.5 m reading and checked again at the wall (S11).
  Also superseded (verbatim): D17 "loops a slash through the strike-slot card (D13)", "rim glow only on the strike-slot enemy",
  "pulsing mic glyph on the card"; S3 "advance to strike slot", "collider in the strike slot", "5/5 enemies travel wall -> strike slot".

## Reveal-distance decision 2026-10-31 (EN-2)
- EN-2 Kev 2026-10-31 after the first on-device test of the encounter, verbatim: "I think the user would want to be able to answer the
  card once they see it rather than wait"; "so once the user clicks on the card no matter how far it is we can start to answer"; "or
  slashes on the card, since we are using hands". Addendum: "cartoonise the cards (add faces to them), since they're rising against the
  human".
  After 3 Opus adversaries, options: (1) "Keep coming, slower" (PICKED): reveal at any distance, fixed creep 0.1875 m/s, knockback to
  2 m only if revealed inside 2 m; (2) "Knock back to 2 m" (rejected: enemy jumps forward when revealed at 3 m); (3) "Card shows by
  itself" (rejected: slash no longer opens the card). Adversary notes: smallest-fix alternative = shorter walk-in only; reframe
  proposed "answer kills, slash parries". Cartoon face (eyes + mouth, angry/mischievous) on the player-facing side; prompt hidden
  until reveal. Resolves the open point "re-slash point undefined after a miss": re-slash valid at any distance.
  Plan A15, D4 (EN-2 note), D13, D13a, D14, S3 + S3 CRITERIA, Open questions; spec ENC-001, -002, -004, -006 amended, ENC-007 added.
  Residuals: creep speed needs one tune on Quest 3/3S; card-face/panel readability unchanged (panel stays at 1 m); hand pinch did not
  select on Kev's Quest 2 run (controllers worked): SDK path verified correct, suspected Quest-side hand tracking setting,
  unconfirmed; real hand swing gesture still a later slice.
  Superseded EN-1 D13 wording (verbatim): "advances along its spawn bearing to a reach line ~0.6 m in front of the play-forward head
  (inside A15), inside the +/-35 deg arc; slash contact (M1) happens only there. Slash -> enemy knocked back to ~2 m (D4 Ultimate
  knockback mechanics) + card pops out (D13a); it then creeps back toward the strike slot 0.5 m in front of the head; telegraphs and
  attacks happen only in the strike slot. Creep time >= 6 s no-speech cap + 2 s grading timeout (D2, D3a); default 8 s; the pacing
  knob (D14, Q8). Grading (D3a) freezes it. Arrived unanswered -> 2 s telegraph -> hit (D4 row). Correct answer (also during the
  telegraph) shatters the panel and peels a card; a multi-card enemy (M2) is knocked back again per card." and "Max 1 engaged enemy
  (reach line to strike slot) at a time".
  Superseded EN-1 spec wording (verbatim): ENC-001 "advances to a reach line ~0.6 m in front of the play-forward head; a slash
  registers only there. Max 1 engaged enemy (reach line to strike slot)"; ENC-002 "Slash -> enemy knocked back to ~2 m (ultimate
  knockback mechanics) and its card face pops out as the ENC-003 panel; the enemy then creeps back toward the 0.5 m strike slot";
  ENC-004 "Creep time >= 6 s no-speech cap + 2 s grading timeout, default 8 s; the pacing knob."; ENC-006 "Correct answer (also
  during the telegraph)" and "a multi-card enemy is knocked back per card".

## Wave, target choice, hit feedback decision 2026-10-31 (EN-3)
- EN-3 Kev 2026-10-31, verbatim: "there should be multiple cards coming at the user, and user gets to choose which card to attack
  first, and also shouldnt the cards be coming out of the walls and everything via passthrough? is it not possible in quest 2"; "every
  time the user hits a card successfully (answers it successfully), there should be some feedback".
  Decided: up to maxActive (default 3, tuning knob) card-enemies advance at once, each from its own D8 wall spawn (ring fallback);
  unrevealed halt at the reach line; player reveals any one at any distance; exactly one revealed (voice target), other selects ignored
  until it resolves; others keep advancing, Grading freezes only the target; correct defeats it, deck refills to maxActive; deck
  cleared = deck empty + 0 active; M2 unchanged. Every correct answer = visible shatter/peel + short sound + haptic where available.
  Passthrough: possible on Quest 2 (grayscale; walls only from manual Space Setup); IWSDK prototype moves from immersive-vr
  (sceneUnderstanding off) to immersive-ar + plane detection next slice; on-device check = probe row f (device-spike ar-probe).
  Plan A5, D8, D13, S3 + S3 CRITERIA, Open questions; D14-D17 moved to decisions-2 (500-line cap); spec ENC-001, ENC-006 amended,
  CARDS-010..012 added.
  Superseded D13 wording (verbatim): "Max 1 engaged enemy (revealed, or halted at the reach line) at a time; others queue at their
  walls."
  Superseded spec wording (verbatim): ENC-001 "Max 1 engaged enemy (revealed, or halted at the reach line); others queue at their
  walls."
