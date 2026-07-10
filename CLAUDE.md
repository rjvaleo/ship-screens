# CLAUDE.md — Ship Data Screen Simulator

Read this before building any new screen in this repo.

## What this project is

A set of standalone sci-fi ship data-screen HTML files (think: bridge/engineering
console displays). Each screen combines a 3D animation, a live audio
spectrograph/waterfall, an oscilloscope, and both **3D spatial** and
**standard stereo** audio sonification. `launcher.html` is a control deck that
spawns any screen into any of 10 independent OS-level windows for tiling
across a desktop.

Full concept roadmap for the remaining screens: see **ROADMAP.md**.
Design/engineering decisions already made for screen 1: see **README.md**.

## Hard constraints — do not violate these

1. **Every screen is a single self-contained `.html` file** under `screens/`,
   with all CSS and screen-specific JS inline. Only two things are ever
   shared: `shared/audio-engine.js` and the Google Fonts CDN calls. Do not
   factor screens into multiple files or add a build step (no bundler, no
   npm install) — the whole point is these run by opening an HTML file.
2. **`shared/audio-engine.js` stays a plain (non-module) script.** It's
   loaded via `<script src="../shared/audio-engine.js"></script>`, not
   `type="module"`. This is deliberate: ES module imports are blocked by CORS
   when a screen is opened directly via `file://`, and we want double-clicking
   the file to still work. Don't convert it to a module, and don't add other
   shared modules that would require one.
3. **Three.js**: loaded from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
   as a global `THREE`, same reason as above (r128 is the last version with a
   working non-module UMD build simple enough for `file://`). Stay on r128
   APIs: notably, **`THREE.CapsuleGeometry` does not exist in r128** — use
   `THREE.CylinderGeometry` + sphere caps, or `THREE.LatheGeometry`, if a
   screen needs a capsule/pod shape (Cryo Bay does).
4. **Never reuse another screen's visual identity.** Each screen needs its
   own palette, type pairing, layout concept, and one signature visual/audio
   idea — see the frontend-design approach below. If a new screen's plan
   reads like a reskin of an existing one (same font pairing, same waterfall
   style, same node-constellation layout), revise it before building.
5. Every new screen must work with **no microphone at all** — always fall
   back gracefully through `ShipAudioEngine`'s built-in synthetic signal bed
   (this is automatic, just don't bypass the engine and hit `getUserMedia`
   directly).

## Design process for each new screen

Follow the same two-pass approach used for screen 1 (Comms Array):

1. **Plan first, in writing, before coding**: name the concept/subject, then
   define a compact token system —
   - **Palette**: 4–6 named hex values
   - **Type**: a display face + a data/mono face (pick different families
     than screens already built — see ROADMAP.md, each screen has assigned
     fonts already so they don't collide)
   - **Layout**: one-paragraph description of the composition + what's
     structurally different about it (e.g. screen 1 is one big 3D viewport +
     side waterfall; later screens should vary this — quad-view, radial,
     card-grid, etc.)
   - **Signature**: the one memorable idea (visual and/or audio) that makes
     this screen unmistakably itself
2. **Critique against the existing screens** before writing code — if the
   token system could describe two different screens in this set, it's not
   specific enough yet.
3. Build it as one HTML file in `screens/`, following the naming convention
   `screen-NN-slug.html` (zero-padded, matching its position in ROADMAP.md).
4. Register it in `launcher.html`: find that screen's entry in the `SCREENS`
   array and flip `status: 'pending'` to `status: 'online'`, and add
   `file: 'screens/screen-NN-slug.html'`. That's the only launcher change
   needed — the grid, dropdowns, and window-spawning all pick it up
   automatically.
5. Update the status table in `README.md`.

## Shared audio engine API (`shared/audio-engine.js`, `window.ShipAudioEngine`)

```js
const engine = new ShipAudioEngine({ fftSize: 2048, smoothing: 0.8 });
const mode = await engine.start();     // must run from a user gesture; returns 'mic' | 'synthetic'

engine.getFrequencyData();             // Uint8Array, length fftSize/2 — for spectrographs
engine.getTimeDomainData();            // Uint8Array, length fftSize — for oscilloscopes
engine.getLevel();                     // 0..1 RMS, quick amplitude reading

const voice = engine.createSpatialVoice({ freq: 220, type: 'sine' }); // HRTF panner voice
voice.setPosition(x, y, z);            // in the audio listener's coordinate space
voice.setFrequency(440, 0.08);         // glide time in seconds
voice.setGain(0.5, 0.08);
voice.stop(0.15);                      // fade-out seconds

engine.pingStandard({ freq: 440, pan: -0.5, duration: 0.3, type: 'sine', gain: 0.5 }); // one-shot, non-spatial

engine.setSpatialGain(0.8);            // master bus levels
engine.setStandardGain(0.5);
```

Don't add new public methods to this file casually — if a screen needs
something the engine doesn't do (e.g. transient/spike detection, harmonic
analysis), implement that *in the screen's own script*, computed from
`getFrequencyData()` / `getTimeDomainData()`, rather than growing the shared
engine. Keep the engine limited to: source acquisition, raw analysis data,
and generic voice/ping primitives.

## Local dev

```
cd ship-screens
python3 -m http.server 8000
```
Open `http://localhost:8000/launcher.html`. Use a local server (not
double-clicking the file) whenever you need to test live microphone input —
`getUserMedia` requires a secure context, which `file://` isn't.

## QA checklist before marking a screen "online"

- [ ] Opens with no console errors both via `file://` and via local server
- [ ] Works with mic permission denied (falls back to synth cleanly)
- [ ] Resizes correctly (all canvases/renderers respond to `window.resize`)
- [ ] Spatial and standard sonification toggles both function independently
- [ ] Distinct palette/type/layout/signature from every other built screen
- [ ] No use of `THREE.CapsuleGeometry` or other post-r128 APIs
- [ ] Registered in `launcher.html`, status table updated in `README.md`
