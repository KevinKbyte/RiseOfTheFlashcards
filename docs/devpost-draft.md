# Devpost submission draft

Plan S13 (submit by 2026-11-17 21:00 PT; deadline 2026-11-18 12:00 PT, rules.md:22). Placeholders in angle brackets are Kev-only.

## Form fields

| Field | Value |
|---|---|
| Submission name | Rise of the Flashcards (plan Q3: distinct from existing titles) |
| Tagline (140 chars, hackathon.md:80) | Humanity forgot them. They didn't forget. |
| Track (rules.md:143) | Gaming |
| Division (rules.md:144) | New Experience (plan G0a 2026-10-28, ADR 0003; set at S13, editable until 2026-11-18 12:00 PT, guidelines.md:101) |
| Project link (rules.md:140) | `<INVITE_URL>` (Competition release channel invite URL; fill in the last-green URL as soon as one exists and keep it current, plan Q7; use a judges-only field if Devpost offers one) |
| Video (rules.md:141) | `<VIDEO_URL>` (new YouTube channel for the game, not personal, plan Q1; under 3 min, public) |
| Screenshots | `<SCREENSHOTS>` (>=3, each passing the frame review: no people, logos, brands, screens, photos) |
| Content rating (rules.md:154) | Target 10+ |
| Target launch date (rules.md:142) | `<TARGET_LAUNCH_DATE>` |

Trailer/store copy taglines (plan Q3): "You skipped your reviews. They noticed." / "The cards remember."

## Description (suggested <=500 words, hackathon.md:83)

**Inspiration.** Flashcards work, but reviewing them feels like a chore. This game turns each card into an enemy you fight in your own
room, so recall becomes something you do with your hands and voice. The story: humanity abandoned its flashcards, deciding they were
boring and procrastinating on them all the time, so now the flashcards are on a rampage. It builds on a theme from my earlier 2D
prototype (see below).

**How we built it.** Engine: `<ENGINE: Unreal Engine 5.7 (spike-gated; Unity 6.3 LTS fallback), final per ADR 0001>` with Meta's hand
tracking, passthrough and scene understanding. Enemies emerge from detected walls; a small play area keeps every move within a seated
reach. Head gaze drives the fight: an enemy reveals its card and starts its attack only while you are looking toward it. Spoken answers
go through `<RECOGNIZER per ADR 0002>` and a deterministic fuzzy matcher with per-card aliases (no AI grading). A Leitner
spaced-repetition scheduler picks which cards return. A small serverless relay lets you paste your own deck on a laptop and pair it to
the headset with a 6-character code.

**Hand interactions (optional field, hackathon.md:85).** Slash a card to attack; slash an orb to answer silently; lean or duck to dodge;
push both palms forward to fire the ultimate. No controller needed at any point.

**Future plans.** More starter decks, richer enemy types and effects, and, after judging, deck import from my separate study app.

**Provenance.** This game was conceived on October 27, 2026 and built from scratch during the competition window. It shares a theme with
my earlier 2D prototype, realm-of-recall (February 2026, a turn-based flashcard RPG): recall as combat, spaced repetition,
multiple-choice answers and enemy hit points all come from there. No code or assets carry over. New in this game: you attack by
slashing card-enemies with your bare hands; you answer by saying the answer out loud (or slashing answer orbs in silent mode); enemies
emerge from the walls of your real room using scene understanding; you dodge their attacks in real time by leaning or ducking; and
bigger enemies carry multi-card health pools, so each correct answer strips one card.

## Testing instructions

1. Install from `<INVITE_URL>` on a Quest 3 or 3S. Play seated; no controllers needed.
2. On first launch, two permission prompts appear:
   - Microphone: allow it to answer by voice. Deny it and the game switches to silent mode automatically.
   - Scene / spatial data: allow it so enemies come out of your walls. Deny it (or skip Space Setup) and enemies spawn on a ring around
     you instead; the game is still fully playable.
3. Play: wait for a card-enemy to reach you, slash the card, then say the answer after the chime. Two missed attempts on one card show
   answer orbs; slash the right one.
4. Silent mode: toggle it any time from `<SILENT_TOGGLE_LOCATION>` to answer by slashing orbs only (good for quiet spaces).
5. Dodge: when an enemy telegraphs an attack, lean sideways or duck. After 5 correct answers, push both palms forward for the ultimate.
6. A run lasts about 4-8 minutes and ends on a mastery screen. Bundled starter decks need no setup; deck pairing is optional.
7. Judging period (Nov 18 - Dec 11): the app and server code do not change. Only two server operations may happen: switching the
   optional deck-pairing relay off, or redeploying the privacy page byte-for-byte unchanged. Each is logged with its time and reason. If
   the relay is off or unreachable, pairing shows "import unavailable"; starter decks are unaffected.
