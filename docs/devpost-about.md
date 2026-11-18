## Inspiration

Flashcards work, but reviewing them feels like a chore. We wanted recall to be something you do with your hands, in your own room.
The story: humanity abandoned its flashcards, deciding they were boring and procrastinating on them all the time, so now the
flashcards are on a rampage. Rise of the Flashcards turns every card you skipped into an enemy that comes back for you.

## What it does

Flashcards are enemies that approach you in passthrough mixed reality. Each card's question floats with a set of answer orbs, and you
slash the right answer with your hand or a controller. A wrong answer, or a card that reaches you, costs one of your five
braincells; run out of braincells and you lose. Five right answers charge your ultimate, a gold orb that blasts the attacker back.
A spaced-repetition scheduler decides which cards come back and when. The game ships with starter decks, and you can import your
own deck as JSON, with a built-in example to copy from. Progress saves on your device; there is no account.

## How we built it

Rise of the Flashcards is a WebXR page built with Meta's Immersive Web SDK (IWSDK) and TypeScript, so it runs in the Quest browser
with nothing to install. It is deployed to GitHub Pages through GitHub Actions. Scheduling uses the FSRS algorithm via ts-fsrs 6.0.0,
with a requested retention of 0.9 and interval fuzz turned off so schedules stay deterministic.

FSRS models the probability that you still remember a card as a power-law forgetting curve:

$$ R(t, S) = \left(1 + f \, \frac{t}{S}\right)^{-d}, \qquad f = 0.9^{-1/d} - 1 $$

Here t is the number of days since your last review, S is the card's stability, and d is a decay parameter. The constant f is
chosen so that recall is exactly 90 percent when t equals S, which gives stability a concrete meaning: it is the number of days
until your recall falls to 90 percent. Solving the curve for a target retention r gives the next review interval:

$$ I(r, S) = \frac{S}{f}\left(r^{-1/d} - 1\right) $$

At our target retention of 0.9, the interval is simply equal to the stability.

We test with 1,676 Vitest unit tests, plus Playwright runs inside the IWSDK emulator.

## Challenges we ran into

Our biggest bug surfaced on submission day. The daily limit of 12 new cards was shared across all decks, so finishing one deck
emptied every other deck's queue too, and every deck showed "Practice done" at once. We fixed it the same day with a replay run, so
you can keep practicing.

We had a Quest 2 but no Quest 3, so we could not try every device ourselves, and putting a headset on for every change is slow.
We leaned on the IWSDK emulator to drive hand and controller interactions in automated tests.

Writing fair multiple-choice distractors was harder than expected. A wrong option has to be plausible but clearly wrong; one card
had to be reworded so that only one answer was right.

## Accomplishments that we're proud of

We shipped a complete mixed-reality study game that anyone with a Quest can open from a link, with no install and no account. It
schedules reviews with a real spaced-repetition algorithm rather than random repetition, and it is backed by a large automated test
suite that runs without a headset.

## What we learned

We learned that a scheduler's math is only half the story: how limits are shared across decks matters as much as the forgetting
curve itself. We learned that an emulator plus automated browser tests can stand in for a headset for most of development. And we
learned that good questions need careful editing, because one ambiguous card can make a fair fight feel unfair.

## What's next for Rise of the Flashcards

More starter decks, richer enemy types and effects, voice answers, and deck import from a separate study app.
