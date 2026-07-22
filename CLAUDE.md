# CLAUDE.md — Ship Data Screen Simulator

Read this before building any new screen in this repo.

## What this project is

A set of standalone sci-fi ship data-screen HTML files (think: bridge/engineering
console displays). Each screen combines a 3D animation, a live audio
spectrograph/waterfall, an oscilloscope, and both **3D spatial** and
**standard stereo** audio sonification. `launcher.html` is a control deck that
spawns any screen into any of 10 independent OS-level windows for tiling
across a desktop.

Full concept roadmap for the screen set: see **ROADMAP.md**. All 10 roadmap
screens are currently built and registered. Design/engineering decisions and
current usage notes live in **README.md**.

## Current implementation highlights

- `app.html` is the primary experience: a single-window Bridge Console with
  Solo / Duo / Trio / Grid layouts, rail promotion, Grid spotlight focus,
  per-pane volume/reactivity, CTL panels, fullscreen, master mute, and a top-bar
  media deck.
- A loaded audio/video file is broadcast to every pane. All 10 panes analyse
  it, and — by design — all 10 can be simultaneously audible (dry pass-through
  and/or each module's own generative reaction via "Feed Generative"):
  switching the featured/promoted pane never mutes or changes anything.
  Each pane runs its own independent `<video>` element decoding the same
  file, so dry pass-through from many panes at once will drift slightly out
  of phase with itself rather than summing as a perfectly locked unison —
  expected given the architecture, not a bug.
- The procedural synth fallback is still owned by each screen's
  `ShipAudioEngine`. Do not replace it with a shared generated-source handoff
  without proving audible output and visual reactivity across all panes; an
  earlier deterministic shared-buffer attempt made the wall feel silent.
- Console settings persist in `localStorage`, including per-screen panel
  controls. When adding or changing panel defaults, bump the prefs migration in
  `app.html` so stale saved Bridge Console settings do not mask the new defaults.
- Recent module-specific controls include Life Support's air-vent hiss tuning
  and Cryo Bay's `User Data` selector (`ECG`, `STAB`, `TEMP`, `AUDIO`).

## Hard constraints — do not violate these

Screens run through the **Vite dev server / build only** — `file://`
double-click support has been dropped, which is what frees up ES modules, npm
packages, and a current Three.js (see the history in "Tooling & tests").

1. **Each screen is its own page** under `screens/` — one screen per HTML entry.
   **Do not merge screens into a single-page app**, add a client-side router, or
   split one screen's UI across multiple pages. Beyond that you're free: screen
   CSS/JS can be inline or imported as ES modules (`type="module"` / `import`),
   and screens may pull in npm packages — Vite builds each page as its own entry
   and bundles it. Shared browser helpers live in `shared/`
   (`audio-engine.js`, `embed.js`, the console hook — see "Bridge Console" —
   and the optional `analytics.js`); they may be plain scripts or ES modules.
2. **Three.js comes from the npm `three` package** (`import * as THREE from
   'three'`, currently ^0.185) — use current APIs. The old r128 CDN pin and its
   limitations (e.g. no `THREE.CapsuleGeometry`) **no longer apply to new
   screens**. Note: the 10 existing screens still load r128 as a global `THREE`
   from cdnjs and haven't been migrated — match a screen's existing approach
   when editing it, and prefer the npm import for anything new.
3. **Never reuse another screen's visual identity.** Each screen needs its
   own palette, type pairing, layout concept, and one signature visual/audio
   idea — see the frontend-design approach below. If a new screen's plan
   reads like a reskin of an existing one (same font pairing, same waterfall
   style, same node-constellation layout), revise it before building.
4. Every new screen must work with **no microphone at all** — always fall
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
a 4×3 wall of full-bleed visualizer thumbnails via the hook's `minimal` mode,
each with an overlaid knob panel + hover-info box). It also has a top-bar media
deck (load an audio/video file to drive every pane), a master **MUTE** button,
and per-pane VOL / RX (reactivity) / CTL controls, plus a **FULLSCREEN** button
for true browser fullscreen mode. The media file's own audible output (and each
module's generative reaction to it, via "Feed Generative") plays from every
pane at once — layout/selection changes never mute or duck any pane's audio.
A new screen works there for free **as long as it follows these conventions**:

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
- `window.__shipConfig({ fps, volume, reactivity, muted, panel, minimal })` —
  the shell's per-pane control channel. `reactivity` scales the analysis data the
  screen sees (see the engine API below); `muted` is a master mute (silences
  output but keeps the visuals live); `panel` is forwarded to the screen's own
  `__shipPanelConfig` (see next point); `minimal: true` is the Grid thumbnail
  mode — the hook promotes the screen's WebGL `<canvas>` to fill the frame and
  hides text chrome, so **the main visualizer must be a WebGL canvas** (every
  screen's Three.js renderer already is) and must refit on a `window` `resize`
  event.

The shell calls these directly (same-origin, so a single user gesture in
`app.html` boots every pane). Volume/reactivity/mute work because
`audio-engine.js` publishes the live instance as `window.__shipEngine`.
`?embed=1` changes nothing when a screen is opened standalone.

**Optional per-screen sound tuning (`window.__shipPanelConfig`):** a screen may
define `window.__shipPanelConfig = function(cfg){ ... }` to accept live-tunable
sonification parameters (pitch, gain, thresholds, rates, etc.). The parameter
list for a screen lives in `app.html`'s `PANEL_CONTROLS[<screen-id>]` array
(key/label/min/max/step/value/kind), and the console renders it two ways: a
slider popover behind each pane's **CTL** button (Solo/Duo/Trio), and a row of
rotary **knobs** with a hover-info box overlaid on each **Grid** thumbnail. Both
are built by the reusable `buildKnobPanel()` / `buildKnob()` helpers in
`app.html` and feed the same `__shipPanelConfig` hook. This is optional — a
screen without the hook simply has no controls — but preferred for new screens so
they're tunable in the console.

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

### Shell-facing API (media source, reactivity, mute, sonic profile)

These exist so the shell (`app.html`) and the engine's own auto-injected **File
Deck** can swap the audio *source* and shape the generated sound at runtime.
Screens generally don't call these — they're the console's control surface — but
they're part of the engine's public contract:

```js
// Media file as the audio source (analysed just like the mic).
await engine.loadMediaFile(file);                      // File/Blob from an <input> or drop
engine.mediaTransport({ action: 'play' });             // 'play'|'pause'|'toggle'|'restart'|'seek'|'seekRatio'
engine.configureMedia({ audible: true, loop: true,     // file's own dry audio + looping
                        feedGenerative: false });      // let modules react to the file like the mic?
engine.getMediaState();                                // { loaded, fileName, playing, currentTime, duration, ... }
// File playback has no effects rack of its own — it's always dry. `audible`
// toggles the file's own clean pass-through. `feedGenerative` does NOT route
// any raw audio anywhere — by default, a screen's own createSpatialVoice()/
// pingStandard() go silent while a file plays (so the file's dry pass-through
// doesn't clash with them); `feedGenerative: true` lifts that suppression, so
// the module's synthesized voices/pings keep reacting to the file's analysis
// exactly as they react to the mic.

// Analysis reactivity (scales getFrequencyData/getTimeDomainData/getLevel output).
engine.setAudioReactivity(1.4);  engine.getAudioReactivity();

// Master mute — silences all audible output at the final gain stage. The
// analyser keeps running, so visuals stay live while muted. Safe before start().
engine.setMuted(true);  engine.toggleMute();  engine.isMuted();

// Sonic profile — shapes the shared generative effects chain the
// sonification voices/pings always run through (tone/movement/texture/pulse
// /drift/space 0..1, plus pitch, cutoff, modRate, delay/flange/phaser/grain
// mixes). Unaffected by `feedGenerative` — that flag only controls whether
// those voices are allowed to fire while media is playing, not how they're
// processed once they do.
engine.setSonicProfile({ tone: 0.6, space: 0.4, cutoff: 9000 });
engine.getSonicProfile();
```

Each of the above is also mirrored on `window` for the same-origin shell:
`__shipLoadMediaFile`, `__shipMediaTransport`, `__shipMediaConfig`,
`__shipMediaState`, `__shipReactivityConfig`, `__shipSetMuted`,
`__shipToggleMute`, `__shipIsMuted`, `__shipSoundConfig`, `__shipSoundState`.
The engine auto-injects the standalone File Deck UI into any page after boot
(including transport, effect, reactivity, and a **Mute Output** button); the
console hides it (`?embed=1`) and drives the engine from its own top-bar media +
MUTE controls instead.

Don't add new public methods to this file casually — if a *screen* needs
something the engine doesn't do (e.g. transient/spike detection, harmonic
analysis), implement that *in the screen's own script*, computed from
`getFrequencyData()` / `getTimeDomainData()`, rather than growing the shared
engine. Keep the engine limited to: source acquisition (mic/media/synth), raw
analysis data, generic voice/ping primitives, and the shell-facing
media/reactivity/mute/sonic-profile controls above.

## Local dev

Preferred (modern toolchain — needs Node 20.11+):

```
cd ship-screens
npm install
npm run dev        # Vite dev server on http://localhost:8000 (+ /api/presets)
```

`vite.config.js` treats every top-level page and every `screens/*.html` as its
own entry (a multi-page build, not an SPA). The `presetsApiPlugin` in
`server/presets.js` reproduces the old Python server's `/api/health` and
`/api/presets` endpoints, so the launcher's Saved Layouts work under Vite too.
`npm run build` emits static files to `dist/`; `npm run preview` serves them.

`file://` double-click is **no longer supported** — screens are served by Vite
(or the built `dist/`). `python3 server.py` still works as a zero-Node static
server for the *current* screens, but it does no bundling, so any screen that
uses ES-module / npm imports needs Vite. Live mic input needs a served origin
either way (`getUserMedia` requires a secure context).

## Tooling & tests

The project has a Vite build/dev/test layer. Screens run through it (or the
built `dist/`); there is no longer a `file://` path to preserve.

**History:** this repo was originally "no build, open the HTML file." That
`file://` goal is what forced non-module scripts and the Three.js r128 pin.
Once a Vite dev/build was added and `file://` support was dropped, those two
constraints were removed — hence ES modules, npm packages, and `three@latest`.

- **Vite** — dev server (`npm run dev`), multi-page build (`npm run build`),
  static preview (`npm run preview`). Config: `vite.config.js`.
- **Vitest** — unit tests for Node-side logic (`npm test`), `happy-dom`
  environment, specs in `tests/unit/**/*.test.js`. Example:
  `tests/unit/presets.test.js` covers the saved-layout store.
- **Playwright** — headless end-to-end/browser behavior in `tests/e2e/**`
  (`npm run test:e2e`, after `npm run test:e2e:install`). Example:
  `tests/e2e/spotlight.spec.js` drives the Bridge Console grid spotlight.
- **Working style**: verify changes by **writing tests and reading their logs**,
  not by manually driving a browser. For live UI confirmation, hand off a
  `http://localhost:8000/...` link and let a human check it.
- **Google Analytics (optional)** — `shared/analytics.js` is a plain script
  that no-ops until a GA4 id is present. Enable via `VITE_GA_ID` in `.env`
  (see `.env.example`) plus `<meta name="ship-ga-id" content="%VITE_GA_ID%">`
  in a page's `<head>`, or `window.SHIP_GA_ID` at runtime. Log events with
  `window.shipTrack('event', {…})`. It is not wired into any screen yet.

## Platform

- **Desktop OS**: macOS, Windows, and Linux (modern desktop browsers).
- **Browsers**: Chrome and Edge are the primary targets; Safari is supported
   (including fullscreen behavior).
- **Runtime**: served via `npm run dev` (Vite) or the built `dist/` (any static
   host). `http://localhost` (a secure context) is required for live mic input
   and launcher saved layouts. `file://` double-click is not supported.

## QA checklist before marking a screen "online"

- [ ] Opens with no console errors via `npm run dev` and `npm run preview`
- [ ] Works with mic permission denied (falls back to synth cleanly)
- [ ] Reacts to a loaded media file via the File Deck (drop in an audio file)
- [ ] Works embedded in `app.html`, including Grid thumbnail/minimal mode,
      Grid spotlight, and rail promotion without iframe reloads
- [ ] Resizes correctly (all canvases/renderers respond to `window.resize`),
      including when promoted to full-frame in the console's Grid (minimal) mode
- [ ] Spatial and standard sonification toggles both function independently
- [ ] Any new panel-control defaults have a Bridge Console `localStorage`
      migration or tests that prove stale saved prefs do not hide them
- [ ] Distinct palette/type/layout/signature from every other built screen
- [ ] Registered in `launcher.html` and `app.html` (`MODULES`); status table
      updated in `README.md`
