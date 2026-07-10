# Ship Data Screen Simulator

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=fff)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=fff)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?logo=javascript&logoColor=000)
![Three.js](https://img.shields.io/badge/Three.js-r128-000?logo=threedotjs&logoColor=fff)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-spatial%20%2B%20FFT-8B5CF6)

![Build](https://img.shields.io/badge/build-none%20(open%20the%20file)-success)
![Dependencies](https://img.shields.io/badge/npm%20dependencies-0-brightgreen)
![Runtime](https://img.shields.io/badge/runs%20on-file%3A%2F%2F%20or%20localhost-blue)
![Screens](https://img.shields.io/badge/screens-1%20%2F%2010%20online-orange)
![Status](https://img.shields.io/badge/status-WIP-yellow)

> Handing this to Claude Code? Start with **CLAUDE.md** (conventions, hard
> constraints, shared audio API reference) and **ROADMAP.md** (full design
> brief for each of the 9 remaining screens). This file covers setup and
> what's already built.

A growing set of sci-fi ship data screens — each a self-contained HTML file with
3D animation (Three.js), a live spectrograph/waterfall, an oscilloscope, and
both **3D spatial** and **standard stereo** audio sonification. `launcher.html`
is the control deck: assign any built screen to any of 10 slots and pop each
one out as its own OS-level window so you can tile them across your desktop.

## Tech stack

Everything runs in the browser with **no build step, no bundler, and zero npm
dependencies** — the entire toolchain is "open an HTML file." That constraint is
deliberate (see CLAUDE.md); the choices below all follow from it.

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Markup / styling** | HTML5, CSS3 | One self-contained `.html` per screen; all CSS inline. CSS Grid for layout, custom properties for each screen's palette tokens. |
| **Language** | Vanilla JavaScript (ES6+) | No framework, no TypeScript, no transpile. Screen logic is inline; only the audio engine is shared. |
| **3D rendering** | [Three.js](https://threejs.org/) **r128** | Loaded as a global `THREE` from cdnjs (UMD build). Pinned to r128 — the last version with a simple non-module build that works over `file://`. Note: no `THREE.CapsuleGeometry` at this version. |
| **Audio** | [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | FFT analysis (`AnalyserNode`), 3D spatial audio via HRTF `PannerNode`, stereo pings via `StereoPannerNode`, procedural synth fallback via `OscillatorNode` + filtered `AudioBufferSourceNode` noise. |
| **Audio input** | `getUserMedia` (live mic) | Falls back automatically to a procedural "deep space signal" synth bed when no mic / permission denied / `file://` origin. |
| **2D drawing** | Canvas 2D | Spectrograph waterfall and oscilloscope are plain `<canvas>` + `CanvasRenderingContext2D`. |
| **Typography** | Google Fonts (CDN) | Per-screen display + mono pairings, assigned in ROADMAP.md so no two screens collide. |
| **Windowing** | `window.open()` | The launcher spawns each screen as a separate OS-level browser window for desktop tiling. |
| **Local dev** | Python `http.server` | Any static file server works; needed only for live-mic testing (secure-context requirement). |

**Shared code:** exactly one module, [`shared/audio-engine.js`](shared/audio-engine.js)
(`window.ShipAudioEngine`) — a plain, non-module script providing source
acquisition, FFT/time-domain data, spatial voices, and standard pings. Screens
are otherwise fully independent.

**No dependencies to install.** The only external loads at runtime are the
Three.js CDN script and the Google Fonts stylesheets.

## Quick start

**Recommended — the bundled app server (full features + saved layouts):**

```
cd ship-screens
./serve.sh            # or: python3 server.py
```

Then open **http://localhost:8000/launcher.html** in Chrome or Edge.

**Direct / no server:** you can also just double-click `launcher.html`.
Everything works except live microphone input and saved layouts — browsers
block `getUserMedia` on the `file://` origin for security reasons, and the
layout API needs the server. Every screen falls back automatically to a
procedurally generated "deep space signal" synth bed, so the 3D animation,
spectrograph, and sonification are all still fully live — it's just not
reacting to real-world sound.

## Server

[`server.py`](server.py) is a **zero-dependency Python 3 standard-library**
server (no `pip install`, matching the project's no-build ethos). It serves
the static screens *and* adds a small JSON API the files can't provide alone.

**Launch:**

```
./serve.sh            # convenience wrapper — default port 8000
./serve.sh 9000       # custom port
python3 server.py     # equivalent, direct
PORT=9000 python3 server.py
```

Stop with `Ctrl+C`. It serves on `http://localhost:8000/launcher.html` by
default.

**Why bother, when screens open straight from disk?**

- **Live microphone** requires a "secure context" — `http://localhost` counts,
  `file://` does not. Serving unlocks real mic-reactive audio.
- **Saved launcher layouts** — assign screens to slots, name the arrangement,
  and reload it later. Stored server-side in `data/presets.json` (gitignored).
  The launcher's "Saved Layouts" bar only appears when the API is reachable;
  under `file://` it stays hidden and everything else works unchanged.

**API endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/health`  | `{ status, screens, presets }` liveness check |
| `GET`  | `/api/presets` | all saved launcher layouts |
| `POST` | `/api/presets` | save a layout — body `{ "name": str, "slots": [...] }` |

**Scripts:**

| File | What it is |
|------|-----------|
| [`server.py`](server.py) | The server itself (stdlib `http.server`). Run directly or via the wrapper. |
| [`serve.sh`](serve.sh) | One-line launcher: `cd`s to the project and runs `python3 server.py [port]`. |

## Using the launcher

- Each of the 10 slots has a dropdown of available screens and an **Open** /
  **Close** button. Screens marked "pending" haven't been built yet.
- **Open** spawns that screen in its own window (not a tab) so you can
  drag/resize/tile it independently — position several across one or more
  monitors to build a full console.
- Re-clicking **Open** on a slot that's already open just focuses that window
  rather than duplicating it.
- **Open All Assigned** launches every slot currently pointed at a built
  screen in one go.

## Status

| # | Screen | Concept | Status |
|---|--------|---------|--------|
| 1 | Comms Array | Long-range signal intelligence: 3D contact constellation, spectrograph waterfall, spatial + standard sonification | ✅ built |
| 2 | Nav Core | Stellar cartography / navigation plotting | pending |
| 3 | Reactor | Engineering core telemetry | pending |
| 4 | Threat Matrix | Tactical / weapons targeting | pending |
| 5 | Anomaly | Xenoscience / anomaly detection scan | pending |
| 6 | Life Support | Atmospherics & environmental systems | pending |
| 7 | Cryo Bay | Medical / cryo-stasis monitoring | pending |
| 8 | Subspace | FTL / warp field harmonics | pending |
| 9 | AI Core | Ship neural substrate visualization | pending |
| 10 | Hull Cameras | External optical array | pending |

Screens 2–10 will be added one at a time — `launcher.html` will pick each one
up automatically as its entry in `SCREENS` is flipped from `pending` to
`online` (no other changes needed).

## Architecture

```
ship-screens/
  launcher.html            control deck — assigns & spawns windows
  shared/
    audio-engine.js        shared Web Audio backbone (mic + synth fallback,
                            FFT analysis, HRTF spatial voices, standard pings)
  screens/
    screen-01-comms-array.html
    ...
```

`shared/audio-engine.js` is loaded as a plain script (not an ES module) so
everything keeps working when opened straight from disk. Each screen is
otherwise fully self-contained: its own HTML/CSS/3D scene/canvas drawing code,
built around a **distinct visual identity** rather than a shared template —
by design, no two screens should look like reskins of each other.

## Screen 1: Comms Array

**Concept:** a signal-intelligence / long-range sonar console — amber
phosphor and worn-terminal in feel, deliberately not the generic glossy-cyan
holographic sci-fi look.

- **3D:** a central ship-core wireframe icosahedron surrounded by 6 drifting
  "contact" nodes on a bearing/range plot, connected to the core by trace
  lines. Node position, pulse, and glow are driven by the live FFT data
  sliced per-contact.
- **Spectrograph:** scrolling amber waterfall on the right, driven by
  `AnalyserNode.getByteFrequencyData`.
- **Oscilloscope:** cyan waveform + amber level meter along the bottom,
  driven by `getByteTimeDomainData`.
- **Spatial sonification (toggle):** each contact gets a persistent HRTF
  `PannerNode` voice positioned to match its 3D location — put on
  headphones and you can hear contacts move around you.
- **Standard sonification (toggle):** independent of spatial mode, contacts
  above an amplitude threshold trigger short stereo-panned "ping" tones.

## Notes for future screens

Each new screen should get its own token system (palette / type / signature
motif) per the project's design approach — reuse the *engine*
(`shared/audio-engine.js`), never the *look*.
