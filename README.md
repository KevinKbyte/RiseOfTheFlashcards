# IWSDK App

This project uses `iwsdk.config.json` for declarative scene, asset, component,
XR, and emulator configuration. Application systems remain explicit in
`src/index.ts`.

```sh
npm install
npm run dev
```

Use the Runtime and Editor controls in the managed browser to switch between
the running experience and its authored scene.

## Device-premises probe board

A spike board (`src/probe/`) that checks on a real headset whether each premise
the game depends on holds. Each row shows a verdict plus evidence; every update
is also logged as a `[probe]` JSON console line and the full board is saved to
`localStorage["probe.lastResults"]`. Evidence is labelled as Quest 2 (judges
use Quest 3/3S).

| Row | Premise | PASS when |
| --- | --- | --- |
| a | Mic inside the immersive session | permission granted in-session and 3 s capture peak RMS > 0.001; PENDING while the AudioContext is not running (suspended: tap Re-run audio) |
| b | Whisper `onnx-community/whisper-tiny.en` on WebGPU | speech in the row-a clip (peak RMS >= 0.01 and a transcript with a 2+ letter word after stripping `[..]`/`(..)` tokens), then p50 of 5 timed runs (after 1 warm-up) <= 1500 ms |
| c | Input sources (controller -> hand) | any hand input seen; controllers alone stay PENDING ("show your hands") |
| d | Persistence | after a reload, localStorage boot count and IndexedDB round-trip both survive |
| e | Frame rate (FPS knee) | p5 >= 60 fps over >= 300 frames at load level 0 (evidence `L0 verdict: ...`, then per-level `L<n> p50/p5 (n=frames)`); load +/- buttons step 50 meshes (max 1000) to find the knee as evidence; metering pauses during the audio probe, the AR probe, and any passthrough session |
| f | `immersive-ar` + planes/mesh | AR session starts and detects > 0 planes or meshes in a 10 s window (`Run AR probe`); PENDING (never FAIL) if the session ends early |
| g | Offline reload under the service worker | the page boots with no network while SW-controlled |

| Verdict | Meaning |
| --- | --- |
| PASS | premise measured and meets the bar |
| FAIL | measured and misses the bar, or errored |
| UNAVAILABLE | capability absent (no getUserMedia / WebGPU / immersive-ar / serviceWorker); for b also: no mic clip from row a, no speech (silent clip, empty or non-speech transcript), or model fetch failed offline (`model not cached/offline`) |
| PENDING | not measured yet; the evidence text is the next operator step |

The in-VR `Re-run audio` button re-runs rows a and b; it works only inside an
XR session (outside it, a still-PENDING row a shows `enter XR to re-run audio`).

### Run on a Quest

Use a production build; row g needs the service worker, which dev builds never
register, so g stays PENDING under `npm run dev`.

```sh
npm run build && npx vite preview --host 0.0.0.0 --port 8081
```

`iwsdkDev` serves HTTPS with a self-signed certificate (cached in
`.iwsdk/https/`), so open `https://<LAN-IP>:8081` on the Quest and accept the
certificate warning. Fallback over USB: `adb reverse tcp:8081 tcp:8081`, then
open `http://localhost:8081` (localhost is a secure context).

For row g: load once online, enable airplane mode, reload.

### Offline notes

- ONNX Runtime wasm is bundled same-origin (transformers.js would otherwise
  fetch it from cdn.jsdelivr.net).
- The SW precaches every `dist/` file (~31 MB); the cache name hashes file
  contents, so a rebuild with changed bytes gets a fresh cache.
- Still network-bound: controller profiles load from cdn.jsdelivr.net
  (`@iwsdk/xr-input` default), and Whisper weights download from Hugging Face on
  first run (then served from the transformers.js browser cache).

### Tests

```sh
node_modules/.bin/vitest run
node_modules/.bin/tsc --noEmit
python -m pytest scripts/fsrs
```

The pytest suite checks that `scripts/fsrs/gen_vectors.py` regenerates
`tests/fixtures/fsrs/vectors.json` byte-for-byte; the fixture is pinned to
py-fsrs 6.3.2 (`scripts/fsrs/requirements.txt`). Regenerate with
`python scripts/fsrs/gen_vectors.py`.

## Starter content

The robot and welcome panel are small examples of authored scene content plus
runtime systems. The robot turns toward the player's head and plays a sound
when pressed. To remove the robot, delete its scene node, its `RobotSystem`
registration from `src/index.ts` or `src/index.js`, and its `Robot` registration
from `src/components.ts` or `src/components.js`; you can then delete the unused
robot component and system files. To remove the welcome panel, delete its scene
node and its `PanelSystem` registration from the application entry point.

The robot stands on the second of three numbered stations. The first holds dark
pieces you can grab and move, and the third holds a ring you can spin in place.
The studio props (the plinths and the dark pieces, plus the floor and stage in VR
and Desktop 3D) are built in code in `src/scene-assets/studio.scene-asset.ts` or
`.js`. The VR and Desktop 3D background furniture is built the same way in
`src/scene-assets/decor.scene-asset.ts` or `.js`, so the starter downloads no
extra models. To remove any of them, delete their scene nodes and their entries
in `src/assets.ts` or `src/assets.js`, then delete the files you no longer use.
The station labels are `public/ui/label-*.uikitml`.

The rest of the look is built-in components in the scene, which you can edit in
the editor without code. The soft light on every object is the scene root's
`IBLGradient` (select the Level Root to edit it), and the soft shadows under
each object are `ContactShadow` nodes. In VR and Desktop 3D, the sky is the
scene root's `DomeGradient` (its colors, tilt and dither are also on the Level
Root), and the floor fades into it through the `DomeFade` on the floor node. AR
projects have no sky or floor, so passthrough stays visible, and a
`ShadowCatcher` node grounds the stations.

- Minimal scene walkthrough: https://iwsdk.dev/guides/01b-minimal-scene.html
- XR-enabled projects — IWER emulator controls: https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls
