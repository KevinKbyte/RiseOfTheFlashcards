# Recon: VR flashcard game (primary-checkout facts, path:line)
R1 Entry period ends Nov 18 2026 12:00:00 PM PT; judging to ~Dec 9; winners ~Dec 11. rules.md:18-32
R2 No changes after entry period; judged on state at deadline; must stay available free until Winner Announcement. rules.md:136,166,168; guidelines.md:102
R3 Unity path = APK in release channel named "Competition" + Invite URL; IWSDK = URL (GH Pages or Vercel etc). hackathon.md:73-74; rules.md:137-138; guidelines.md:111 ("APKs will not be considered" without channel link)
R4 Hands-first hard req; seated 2ft; bus-stop <=10 min; not a wrapper. rules.md:110-134
R5 Judging 4x25%: innovation, experience design (purposeful passthrough, FoV-aware), technical (ISDK v207+, hand tracking, passthrough, MRUK, anchors; min 60 fps; "rooms the developer never tested"), polish (video honest, no AI video carrying pitch). rules.md:195-239
R6 Specials $25k: Reason to Come Back, First Five Minutes, Accessibility (voice alternatives for hands), Boldest Concept. rules.md:321-328. One prize per entry. rules.md:249
R7 Suggested SDK: Unity Meta XR SDKs v81+ (v207) All-in-One; IWSDK Node>=20.19. hackathon.md:63,66. Node v22.12.0 installed.
R8 Judges use Quest 3/3S; Quest 2 compat not judged. guidelines.md:55,61
R9 1:1 mentorship banned Sep 24-Nov 18 for the project. guidelines.md:49. Support = forum, workshops, office hours. guidelines.md:115
R10 Video <3 min, public on YouTube or Vimeo, Quest/XR Simulator footage OK. rules.md:141
R11 Originality: own or public-domain or Meta-provided content; licensed third-party tools; sponsor may demand proof of license. rules.md:145,149,179
R12 Projects may not mention/depict any identifiable person other than Entrants; no brand names/logos. rules.md:157,161. English required. rules.md:155. Content 10+/13+/18+. rules.md:154
R13 Meta license is broad: irrevocable, sublicensable, perpetual for evaluation + promo. rules.md:342 (guidelines.md:44 calls it "limited license ... judging and promotional")
R14 Start membership + Devpost "Join Hackathon" needed by submission. rules.md:44-46,72; flair check guidelines.md:107-109
R15 MemriPal ADR 0008: Web Speech API rejected (non-Meta, Chrome-only, audio to Google); deterministic matcher token-window ratio >=0.8 or key-term coverage >=60%. meta-global-2026/memripal/docs/decisions/0008-spoken-recall-deterministic-matcher.md:15-25; plan :130
R16 MemriPal deadline Nov 4 9:00 PM ET; finals Nov 9 12:00 PM ET. meta-global-2026/rules.md:42,44
R17 game repo: main @ 37d0378 (LICENSE "Copyright (c) 2026 Kev", provenance msg); untracked .claude/ only. game/LICENSE:3
R18 Unity installed: 2022.3.62f3 and 6000.2.13f1, BOTH only windowsstandalonesupport (NO Android Build Support module). C:/Program Files/Unity/Hub/Editor/*/Editor/Data/PlaybackEngines. Android SDK + adb present (AppData/Local/Android/Sdk). git-lfs, gh installed; no vercel/netlify CLI.
R19 PROVENANCE HAZARD: C:/Users/Kev/projects/realm-of-recall = pre-existing (2026-02-12..02-28) Unity 2022.3 2D RPG "combat effectiveness determined by recall from flashcards" with SR. realm-of-recall/README.md:3. New Experience forbids pre-existing codebases. rules.md:91
R20 Web (unverified, forum-grade): Meta Voice SDK = Wit.ai cloud, no offline; Quest Browser does not expose Web Speech recognition; vosk-browser (WASM) exists; IWSDK has hand tracking + scene understanding (planes/meshes, AR projects only). developers.meta.com voice sdk pkg pages; communityforums.atmeta.com/discussions/dev-quest/speechrecognition-in-webxr/1168273; developers.meta.com/horizon/documentation/web/iwsdk-overview/
