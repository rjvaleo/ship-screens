# Ship Data Screen Simulator

> Handing this to Claude Code? Start with **CLAUDE.md** (conventions, hard
> constraints, shared audio API reference) and **ROADMAP.md** (full design
> brief for each of the 9 remaining screens). This file covers setup and
> what's already built.

A growing set of sci-fi ship data screens — each a self-contained HTML file with
3D animation (Three.js), a live spectrograph/waterfall, an oscilloscope, and
both **3D spatial** and **standard stereo** audio sonification. `launcher.html`
is the control deck: assign any built screen to any of 10 slots and pop each
one out as its own OS-level window so you can tile them across your desktop.

## Quick start

**Recommended (full features, including live microphone):**

```
cd ship-screens
python3 -m http.server 8000
```

Then open **http://localhost:8000/launcher.html** in Chrome or Edge.

**Direct / no server:** you can also just double-click `launcher.html`.
Everything works except live microphone input — browsers block `getUserMedia`
on the `file://` origin for security reasons. Every screen falls back
automatically to a procedurally generated "deep space signal" synth bed, so
the 3D animation, spectrograph, and sonification are all still fully live —
it's just not reacting to real-world sound.

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
