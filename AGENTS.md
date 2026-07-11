# AGENTS.md — Ship Data Screen Simulator

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
   with all CSS and screen-specific JS inline. Only three things are ever
   shared: `shared/audio-engine.js`, `shared/embed.js` (the console hook —
   see "Bridge Console" below), and the Google Fonts CDN calls. Do not
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
5. Register it in `app.html` too: add a `MODULES` entry
   (`{ id, title, sub, file, accent }`) so it appears in the Bridge Console.
   Optionally add a `PANEL_CONTROLS[<id>]` array so the pane gets a live sound-
   tuning **CTL** panel (see the console hook section for the `__shipPanelConfig`
   contract).
6. **Include the console hook** and the shared ids it depends on (see below).
7. Update the status table in `README.md`.

## Bridge Console (`app.html`) + the embed hook

`app.html` is the default entry: it loads all 10 screens as `<iframe>`s (each
with `?embed=1`) into one window, in Solo / Duo / Trio / Grid layouts (Grid is
a 4×3 wall of pure-visualizer thumbnails via the hook's `minimal` mode). It also
has a top-bar media deck (load an audio/video file to drive every pane) and
per-pane VOL / RX (reactivity) / CTL controls. A new screen works there for free
**as long as it follows these conventions**:

- Load the hook right after the audio engine:
  `<script src="../shared/embed.js"></script>` (after
  `audio-engine.js`, before the screen's inline script).
- Use the shared ids the hook drives: the boot overlay is `#boot-overlay`
  and its start button is `#boot-btn` (the hook boots a screen by clicking
  `#boot-btn`, so the button's own click handler must be what calls
  `engine.start()` + starts the render loop — as every screen already does).
- Put post-boot toggles in a container the hook can hide: either
  `.float-controls` or `#controls` (both are hidden when embedded).
- Drive the render loop through the **global** `requestAnimationFrame`
  (i.e. call `requestAnimationFrame(loop)`, don't cache a local reference) —
  the hook wraps it to throttle rail previews to a low frame rate.

The hook exposes on each embedded screen:

- `window.__shipBoot()` — boots the screen (clicks `#boot-btn`).
- `window.__shipConfig({ fps, volume, reactivity, panel, minimal })` — the
  shell's per-pane control channel. `reactivity` scales the analysis data the
  screen sees (see the engine API below); `panel` is forwarded to the screen's
  own `__shipPanelConfig` (see next point); `minimal: true` is the Grid
  thumbnail mode — the hook promotes the screen's WebGL `<canvas>` to fill the
  frame and hides text chrome, so **the main visualizer must be a WebGL canvas**
  (every screen's Three.js renderer already is) and must refit on a
  `window` `resize` event.

The shell calls these directly (same-origin, so a single user gesture in
`app.html` boots every pane). Volume/reactivity work because `audio-engine.js`
publishes the live instance as `window.__shipEngine`. `?embed=1` changes nothing
when a screen is opened standalone.

**Optional per-screen sound tuning (`window.__shipPanelConfig`):** a screen may
define `window.__shipPanelConfig = function(cfg){ ... }` to accept live-tunable
sonification parameters (pitch, gain, thresholds, rates, etc.). The Bridge
Console's per-pane **CTL** panel drives it; the parameter list for a screen lives
in `app.html`'s `PANEL_CONTROLS[<screen-id>]` array (key/label/min/max/step/
value/kind). This is optional — a screen without the hook simply has no CTL
panel — but preferred for new screens so they're tunable in the console.

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

**Reactivity note (important for screens):** `getFrequencyData()` and
`getTimeDomainData()` return **reactivity-scaled copies**, not the raw analyser
arrays — every value is multiplied by the current audio-reactivity amount
(`setAudioReactivity(0..2)`, default 1, driven by the console's RX slider /
`__shipConfig({reactivity})`). At `1` this is a no-op passthrough; a screen just
reads the returned arrays as before. Don't cache the returned array across frames
assuming it's the raw buffer, and don't re-apply your own reactivity scaling on
top.

### Shell-facing API (media source, reactivity, sonic profile)

These exist so the shell (`app.html`) and the engine's own auto-injected **File
Deck** can swap the audio *source* and shape the generated sound at runtime.
Screens generally don't call these — they're the console's control surface — but
they're part of the engine's public contract:

```js
// Media file as the audio source (analysed just like the mic).
await engine.loadMediaFile(file);                      // File/Blob from an <input> or drop
engine.mediaTransport({ action: 'play' });             // 'play'|'pause'|'toggle'|'restart'|'seek'|'seekRatio'
engine.configureMedia({ audible: true, loop: true,     // file's own audio + looping
                        effect: 'reverb', cutoff: 4000, pitch: 0 }); // pass-through FX
engine.getMediaState();                                // { loaded, fileName, playing, currentTime, duration, ... }
//   effect ∈ none|filter|delay|reverb|chorus|flange|pitch

// Analysis reactivity (scales getFrequencyData/getTimeDomainData/getLevel output).
engine.setAudioReactivity(1.4);  engine.getAudioReactivity();

// Sonic profile — shapes the generated-sound effects chain the sonification
// voices run through (tone/movement/texture/pulse/drift/space 0..1, plus
// pitch, cutoff, modRate, delay/flange/phaser/grain mixes).
engine.setSonicProfile({ tone: 0.6, space: 0.4, cutoff: 9000 });
engine.getSonicProfile();
```

Each of the above is also mirrored on `window` for the same-origin shell:
`__shipLoadMediaFile`, `__shipMediaTransport`, `__shipMediaConfig`,
`__shipMediaState`, `__shipReactivityConfig`, `__shipSoundConfig`,
`__shipSoundState`. The engine auto-injects the standalone File Deck UI into any
page after boot; the console hides it (`?embed=1`) and drives the engine from its
own top-bar media controls instead.

Don't add new public methods to this file casually — if a *screen* needs
something the engine doesn't do (e.g. transient/spike detection, harmonic
analysis), implement that *in the screen's own script*, computed from
`getFrequencyData()` / `getTimeDomainData()`, rather than growing the shared
engine. Keep the engine limited to: source acquisition (mic/media/synth), raw
analysis data, generic voice/ping primitives, and the shell-facing
media/reactivity/sonic-profile controls above.

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
- [ ] Reacts to a loaded media file via the File Deck (drop in an audio file)
- [ ] Resizes correctly (all canvases/renderers respond to `window.resize`),
      including when promoted to full-frame in the console's Grid (minimal) mode
- [ ] Spatial and standard sonification toggles both function independently
- [ ] Distinct palette/type/layout/signature from every other built screen
- [ ] No use of `THREE.CapsuleGeometry` or other post-r128 APIs
- [ ] Registered in `launcher.html` and `app.html` (`MODULES`); status table
      updated in `README.md`
