# Privacy policy (draft)

Effective date: TBD (Kev). Applies to the web game Rise of the Flashcards, played in the Meta Quest browser (or a desktop browser),
including its 2D deck-import page.

The game has no accounts, no analytics, and no game server. Your progress and decks never leave your device.

## Permissions the game asks for

- Spatial / room data (WebXR plane detection, optional): lets enemies come out of your real walls. Wall shapes are used in the page
  while you play and are never stored or sent anywhere. Deny it and enemies spawn on a ring around you instead. The game does not read
  camera images; the headset shows passthrough itself.
- The game does not use the microphone or camera and does not ask for those permissions.

## What is stored on your device

All saved data lives in this browser's local storage on your device, under these keys:

| Key | What it holds |
|---|---|
| `flashcards.fsrs.save` | Study progress (spaced-repetition schedule) per deck |
| `flashcards.fsrs.save.backup` | Backup copy of the progress save |
| `flashcards.decks` | Decks you imported |
| `flashcards.decks.backup` | Backup copy of imported decks |

A deck you paste or choose as a file on the deck-import page is read in the browser and saved only to the keys above. To delete
everything, clear this site's data in the browser settings.

## What leaves your device

- Gameplay sends nothing: no answers, progress, decks, or room data are transmitted.
- Loading the page: your browser downloads the game files from the site host, which sees your IP address as part of any web request.
  Host name and its log retention: TBD (Kev).
- Controller models: when you use controllers, the browser may download their 3D models from a public CDN (cdn.jsdelivr.net), which
  also sees your IP address.

## If voice / relay grading is enabled later

Not in the current build. Earlier drafts made the commitments below; they apply only if a later version turns these features on, and
this policy will be updated (with a new effective date) before that happens.

- Microphone: used only to hear spoken answers. Opens when you slash a card, closes when you stop speaking (6 s at most with no
  speech). Deny it, or turn on silent mode, and you answer by slashing orbs; nothing is recorded.
- Voice audio is processed on the device only (on-device recognizer) and never uploaded or stored. The text transcript stays on the
  device too, unless you turn on Live AI grading in Settings: then the transcript of an answer the game could not match is sent, with
  that card's text, through our relay to Anthropic (Claude API) for a correct/incorrect verdict. We do not store it.
- Bystander speech: anyone talking near you while the mic is open is captured too, and handled the same way.
- Relay (Vercel + Upstash): your IP address is a rate-limit key when you start pairing or post a deck, expiring after the 60 s window.
  Function logs record request path, status and timing, never the request body or deck text, kept per Vercel's log retention for the
  hosting plan.
- A deck pasted on the companion page is held in the relay store (Upstash Redis), deleted the moment the headset collects it and in
  any case after 15 minutes. When posted, its card text is sent through the relay to Anthropic (Claude API) once, to suggest extra
  accepted answers.
- Audio never leaves the device; text transcripts leave it only as Live AI grading describes.
- Text sent to Anthropic follows Anthropic's API data-retention terms, not ours: https://www.anthropic.com/legal/privacy and
  https://www.anthropic.com/legal/commercial-terms.
- After the competition results (about 2026-12-11), all relay (Upstash) keys are purged.

## Contact

Privacy questions: TBD (Kev) (contact email). Because the game keeps no data off your device, there is nothing for us to delete;
clearing the site's data in your browser removes everything.
