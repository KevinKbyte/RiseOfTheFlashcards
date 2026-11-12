# Devpost submission draft

Submit by 2026-11-17 21:00 PT; deadline 2026-11-18 12:00 PT (rules.md:22). Matches the shipped WebXR build (Meta IWSDK, Quest
browser). Anything marked `TBD (Kev)` is owner-only.

## Form fields

| Field | Value |
|---|---|
| Submission name | Rise of the Flashcards |
| Tagline (140 chars, hackathon.md:80) | Humanity forgot them. They didn't forget. |
| Track (rules.md:143) | Gaming |
| Division (rules.md:144) | New Experience (editable until 2026-11-18 12:00 PT, guidelines.md:101) |
| Team name | TBD (Kev) |
| Project link (rules.md:140) | TBD (Kev): public demo URL of the hosted web build (opens in the Quest browser) |
| Repo link | TBD (Kev) |
| Video (rules.md:141) | TBD (Kev): YouTube URL on the game's own channel, under 3 min, public |
| Screenshots | TBD (Kev): at least 3, each passing the frame review (no people, logos, brands, screens, photos) |
| Content rating (rules.md:154) | Target 10+ |
| Target launch date (rules.md:142) | TBD (Kev) |

Trailer/store taglines: "You skipped your reviews. They noticed." / "The cards remember."

### Trailer beat sheet (Kev, 2026-10-28; total <180 s, rules.md:141)

| Time | Beat |
|---|---|
| 0-3 s | Flash-forward: Kev slashes the right answer orb out of the air (headset capture). Hard cut, "Earlier..." card. |
| 3-9 s | Kev (college kid) writes flashcards on his phone, says "I'll review them later tonight", sets the phone face-down on the table. |
| 9-15 s | Goes out partying: jacket on, door closes; party audio only. |
| 15-21 s | Exam: big red F on a blank-header paper; he shrugs and never touches the phone again. |
| 21-27 s | Phone buzzes on the table; title card "Humanity forgot them. They didn't forget." |
| 27-33 s | Kev puts on the Quest; card-enemies emerge from the real walls of his room in passthrough. |
| 33-170 s | Gameplay: hand slashes on answer orbs, losing shield pips, firing the ultimate. |
| End | Cards: "Later tonight?", then title "Rise of the Flashcards". |

No AI footage (rules.md:237). Skit constraints: Kev is the only person in frame; party is audio-only (no other people, no branded drinks
or products); phone screen always faces away from camera and its logo is hidden (no visible screens); exam paper has no school name or
logo; cleared room. Skit shot on phone on Nov 16.

## Description (suggested <=500 words, hackathon.md:83)

**Inspiration.** Flashcards work, but reviewing them feels like a chore. This game turns each card into an enemy that comes at you in
your own room, so recall becomes something you do with your hands. The story: humanity abandoned its flashcards, deciding they were
boring and procrastinating on them all the time, so now the flashcards are on a rampage. It builds on a theme from my earlier 2D
prototype (see below).

**What it does.** Card-enemies come out of the walls of your room in waves and walk toward you. The question shows on a panel with
floating answer orbs; slash the right orb to defeat the enemy. You have 5 shield pips: an enemy that reaches you, or a wrong orb, costs
one pip (at most once per card) and marks that card to come back sooner. Clear all 12 cards in a run to win; lose all pips and the run
ends. Correct answers charge an ultimate that knocks the attacking enemy back. A spaced-repetition scheduler decides which cards come
back and when, and your progress is saved per deck.

**How we built it.** Built on Meta's Immersive Web SDK (IWSDK), so it runs as a WebXR page in the Quest browser with nothing to install;
the desktop IWER emulator runs it too. The session uses passthrough and WebXR plane detection: enemies emerge from your detected walls,
and if no walls are known they spawn on an even ring around you. The FSRS spaced-repetition algorithm (ts-fsrs) schedules each card.
Three starter decks are built in (World Capitals, Opposites, Basic Science), and you can import your own deck as JSON (paste or file) on
the 2D page before entering VR; duplicate cards get a keep/drop review with a confirm step and Undo. Everything is stored in the
browser's local storage on your device; there are no accounts and no game server.

**Hand interactions (optional field, hackathon.md:85).** Hand tracking first: swipe a fingertip through the right answer orb to answer.
Controllers also work (swing the controller tip through the orb), and pressing the trigger on an orb is the accessibility fallback. Fire
the ultimate by pushing both palms forward, squeezing grip, or selecting the glowing ultimate orb.

**Future plans.** More starter decks, richer enemy types and effects, voice answers, and, after judging, deck import from my separate
study app.

**Provenance.** This game was conceived on October 27, 2026 and built from scratch during the competition window. It shares a theme with
my earlier 2D prototype, realm-of-recall (February 2026, a turn-based flashcard RPG): recall as combat, spaced repetition,
multiple-choice answers and enemy hit points all come from there. No code or assets carry over. New in this game: you answer by slashing
answer orbs with your bare hands in mixed reality; enemies emerge from the walls of your real room; and each run is a wave fight with
shield pips and a gesture-fired ultimate.

## Testing instructions

1. On a Quest 3 or 3S, open TBD (Kev) (demo URL) in the Quest browser and enter VR. Hands or controllers both work. On desktop, the same
   URL runs in the IWER emulator.
2. Optional: before entering VR, import your own deck as JSON on the 2D page (paste or choose a file). The three starter decks need no
   setup.
3. The browser may ask for spatial / room data. Allow it so enemies come out of your walls; deny it (or skip Space Setup) and enemies
   spawn on a ring around you instead. The game is fully playable either way. No microphone permission is requested.
4. Pick a deck, then play: when an enemy approaches, swipe a fingertip (or controller tip) through the correct answer orb, or point at
   it and press the trigger.
5. After 5 correct answers the ultimate is ready (it glows): push both palms forward, squeeze grip, or select the ultimate orb.
6. A run ends when you clear all 12 cards (win) or lose all 5 shield pips (loss), then shows your mastery for the deck. Progress is
   saved on the device.

## If voice / relay grading is enabled later

Not in the submitted build. Earlier drafts committed to the items below; if any ships, restore its copy here.

- Voice answers: slash a card, then say the answer after the chime, through an on-device speech recognizer and a deterministic fuzzy
  matcher with per-card aliases; two missed attempts on one card show the answer orbs. Microphone denied = silent mode automatically.
  Silent mode toggle location: TBD (Kev).
- Claude (Anthropic API): suggests extra accepted answers when a deck is imported, and an optional Live AI grading setting asks Claude
  about answers the matcher could not place.
- Relay: a small serverless relay lets you paste a deck on a laptop and pair it to the headset with a 6-character code. Judging period
  (Nov 18 - Dec 11): app and server code do not change; only two server operations may happen, switching the relay off or redeploying
  the privacy page byte-for-byte unchanged, each logged with time and reason. Relay off or unreachable = pairing shows "import
  unavailable"; starter decks unaffected.
- Dodge: lean sideways or duck to dodge an enemy's telegraphed attack.
- Also planned but not in this build: head gaze driving the fight (an enemy reveals its card and attacks only while you look toward
  it); bigger enemies with multi-card health pools and armor tiers; a first-launch intro where a virtual phone on your real table cracks
  and the cards break out (the original trailer 27-33 s beat, with a paper-cards-and-drawer skit fallback); an original target run
  length of about 4-8 minutes.
