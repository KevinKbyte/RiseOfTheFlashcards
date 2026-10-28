# Privacy policy (draft)

Last updated: 2026-10-28. Applies to the game `<TITLE>` for Meta Quest and its companion deck-paste page.

The game has no accounts. This page lists everything it sends off your headset, how long it is kept, and how to have it deleted.

## Permissions the game asks for

- Microphone: used only to hear your spoken answers. The mic opens when you slash a card and closes when you stop speaking (6 s at most
  with no speech). Deny it, or turn on silent mode, and you answer by slashing orbs instead; nothing is recorded.
- Scene / spatial data: lets enemies come out of your real walls. The game does not read raw camera images; the headset shows passthrough
  itself.

## What leaves the headset

1. Voice audio of each spoken answer, and its text transcript, go to Wit.ai (Meta's speech service). They stay in the game's Wit.ai app
   log until the purge below; Meta's own handling follows Meta's privacy policy.
2. Bystander speech: anyone talking near you while the mic is open is captured too, and handled the same as item 1.
3. Your IP address is used as a rate-limit key when you start pairing or post a deck (relay on Vercel + Upstash). The key expires after
   the 60 s rate-limit window.
4. Relay function logs (Vercel) record request path, status and timing, never the request body or deck text. Kept per Vercel's log
   retention for the hosting plan.
5. A deck you paste on the companion page is held in the relay store (Upstash Redis). It is deleted the moment the headset collects it,
   and in any case after 15 minutes.

If the build uses on-device speech recognition instead of Wit.ai (ADR 0002), items 1 and 2 do not apply: audio never leaves the headset.

## What stays on the headset

- 6. Scene and room data (walls, room layout): used on the headset only, never uploaded.
- Your study progress and imported decks: saved on the headset only. Uninstalling the game removes them.

## After judging

After the competition results (about 2026-12-11), the Wit.ai utterance log and all relay (Upstash) keys are purged.

## Deletion and contact

7. To ask for your data to be deleted, or with any privacy question, email `<CONTACT_EMAIL>`. Include the approximate date and time you
played so the matching voice entries can be found.
