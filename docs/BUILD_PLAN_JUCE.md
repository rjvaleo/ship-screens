# Build Plan — JUCE (Main Window + Audio Engine)

Status: Draft v1 · Companion to `ModularAudio_FuncSpec_v11`

This plan covers **track B**: the audio engine and the **Main Window** of the
Modular Audio Environment, built on **JUCE**. It ships as a **standalone app
(macOS + Windows)** and, from the same codebase, as **VST3 / AU** plugins —
covering the functional spec's Phase 2 (desktop) and Phase 3 (plugin) in one
effort. The rich **Visualizer Window** is a separate track (**C**, Unreal /
node-based visuals — see `docs/VISUAL_PLATFORMS.md`); it consumes data this
engine already produces.

> **Why JUCE supersedes the spec's "Electron/Tauri" for Phase 2:** JUCE gives us
> real, sample-accurate DSP, one codebase for standalone **and** plugin, and a
> mature cross-platform audio-app framework. The existing browser build is kept
> as the **Phase-1 prototype / algorithm lab**, not the shipping desktop app.

---

## 1. Architecture: one portable core, thin JUCE host

```
        ┌─────────────────────────────────────────────┐
        │  ShipCore  (portable C++20, no JUCE deps)     │
        │  • Signal graph: nodes / banks / patch bay    │
        │  • 4 Player engines (Looper/Granular/Perc/Synth)
        │  • Module Suite DSP + the 10 "reactive" modules│
        │  • Transport + per-column sync                 │
        │  • Macros · Snapshots · Scene morph            │
        │  • Capture (snapshot + delta stream)           │
        │  • 108-scale tuning library + sequencer        │
        │  • Analysis → visual data streams (1, 2, global)
        └───────────────┬───────────────────┬───────────┘
                        │                   │
             ┌──────────┴─────────┐   ┌─────┴───────────────────┐
             │  JUCE host (this)  │   │  Visual data link (out)  │
             │  • Audio I/O + fmts│   │  • Stream 1: signal viz  │
             │  • Node-graph UI   │   │  • Stream 2: playback data│
             │  • Mixer / master  │   │  • Global analysis        │
             │  • Edit/Perf views │   │  → Visualizer (track C)   │
             │  • Timeline view   │   └──────────────────────────┘
             └────────────────────┘
```

**Rule:** all reusable logic lives in **ShipCore** and depends on *nothing* from
JUCE. JUCE is only: audio device/plugin host, UI, and the analysis-data
publisher. This keeps ShipCore reusable by the Unreal Visualizer and any future
host, and unit-testable headless.

---

## 2. Tech stack & tooling

| Concern | Choice |
|---|---|
| Framework | **JUCE 8** (audio_processors, dsp, gui, audio_utils) |
| Language | **C++20** |
| Build | **CMake** with JUCE via `FetchContent`/CPM (no Projucer checked in) |
| DSP | `juce::dsp` (filters, FFT, oscillators, convolution) + custom in ShipCore |
| Params | `AudioProcessorValueTreeState` for plugin automation; ShipCore holds the source-of-truth model |
| Plugin formats | **VST3**, **AU (AUv2)**; Standalone. (AAX later.) |
| Plugin QA | **pluginval** in CI (strictness 8+) |
| Unit tests | **Catch2** (ShipCore is headless-testable) |
| CI | **GitHub Actions**: macOS (arm64+x86_64) & Windows; build + pluginval + tests |
| Formatting | clang-format; clang-tidy on ShipCore |

---

## 3. ShipCore layer (headless, the real IP)

1. **Signal graph** — nodes, banks (serial/parallel), bank patch bay, free
   node-to-node routing, feedback detection, per-level wet/dry + bypass
   (spec §14–18).
2. **Player engines** (spec §6–9) — Looper, Granular (PaulStretch-style
   stretch), Percussion (choke groups), Synth (3-osc + filter + 2 env + 2 LFO +
   8×12 mod matrix). v1 order: Looper → Percussion → Synth → Granular.
3. **Module Suite** (spec §20) — Reverb, Delay, Chorus/Flanger/Phaser, Pitch,
   Saturation, Spectral Freeze, Comp/Limiter, EQ, Widener, Granular Processor,
   Bit Crusher, Spectrum Analyzer.
4. **The 10 "reactive" modules** — the current ship screens, ported as
   **effect nodes**: input → analyze → generate signature sonification as the
   **wet** output (blended by node Wet/Dry, with Bypass), each also emitting its
   signature visualization on Stream 1/2. This is the "make the input-driven
   synthesis an effect on incoming audio" requirement, expressed as node anatomy.
5. **Transport & sync** (spec §25–26) — global clock, per-column sync
   (free/½/1/2/3/4/custom bars), start & phase offsets.
6. **Macros** (spec §22), **Snapshots + scene morph** (spec §24),
   **Capture** (spec §31, initial snapshot + timestamped delta stream).
7. **Tuning** (spec §20.13) — 108-scale library, true cents/ratios, Hz root.
8. **Analysis → visual streams** — level, per-band energy, transients/onsets,
   spectral centroid, pitch, stereo width, plus per-node "playback data"
   (LFO phase, decay curves, grain positions…). Published on a lock-free bus.

---

## 4. JUCE host layer (Main Window)

- **Audio**: `AudioProcessor` (plugin) / `AudioDeviceManager` (standalone) both
  drive one ShipCore instance. Sample-rate/buffer from host or Preferences.
- **Node-graph canvas** (spec §3, §14): scroll/zoom fluid zone; nodes/banks with
  always-exposed controls; connection lines with the three live signal-flow
  modes (amplitude glow / waveform-on-wire / frequency color). Render via
  JUCE `Graphics` first; move hot paths to an OpenGL layer if needed.
- **Fixed zones**: transport bar, column headers, mixer, master strip, global
  (snapshot) panel — the tracker/column aesthetic (spec §1.5).
- **Edit vs Performance view + flag system** (spec §5).
- **Timeline view** — a JUCE window onto ShipCore's capture/delta stream.
- **Visual data link out** — publish Stream 1/2 + global analysis for track C
  (see §6 below).

---

## 5. Visual integration hook (bridge to track C)

The engine is the single source of visual truth. The host exposes:

- **Analysis/control bus** (params + audio features) over **OSC** (or shared
  memory locally) — cheap, language-agnostic.
- **Texture sharing** for already-rendered node scopes when needed —
  **Syphon** (macOS) / **Spout** (Windows), or NDI for network.

Any visual runtime (ISF in-host, TouchEngine, Unreal, Notch) subscribes to this
one contract. Designing this bus well is the critical interface — see
`docs/VISUAL_PLATFORMS.md`.

---

## 6. Reuse from the current prototype

- **Port once → ShipCore:** each ship module's sonification algorithm + its
  `PANEL_CONTROLS` parameter schema (JS → C++). This is the reusable IP.
- **Keep alive:** the browser app as the Phase-1 lab for graph/macro/morph UX
  and per-module algorithm iteration before committing to C++.
- **Carries to track C:** the 10 visual identities → Visualizer presets;
  Three.js scenes → reference for the 3D world.

---

## 7. Phased milestones

| M | Deliverable | Exit criteria |
|---|---|---|
| **M0** | Repo, CMake, JUCE, CI, empty standalone+VST3 that builds on Mac+Win | pluginval passes on an empty plugin |
| **M1** | ShipCore skeleton + audio I/O + Master column + one Looper Player | file loops, master meter/limiter, headless Core tests |
| **M2** | Node graph + wet/dry/bypass + a Module Suite subset (EQ, Delay, Reverb, Comp) | build a serial chain, hear it, viz windows live |
| **M3** | The 10 reactive modules as nodes (ported algorithms) + analysis bus | each processes incoming audio, emits Stream 1/2 |
| **M4** | Macros + snapshots + scene morph | one knob moves many params; morph between two states |
| **M5** | Capture (delta stream) + Timeline view | record, scrub, reconstruct state; overdub |
| **M6** | Remaining Players (Granular, Percussion, Synth+sequencer) + full Module Suite | spec v1 feature-complete |
| **M7** | Plugin polish: automation, state save/load, pluginval strict, notarization/signing | shippable VST3/AU + standalone |
| **C-link** | OSC/Syphon-Spout bus consumed by the chosen visual runtime | Visualizer reacts to live engine data |

---

## 8. Open decisions
- Node-graph rendering: JUCE `Graphics` vs an OpenGL/`juce::OpenGLContext` layer
  (decide at M2 based on node count/perf).
- Parameter model: how much lives in APVTS (for host automation) vs ShipCore's
  own model, and how they sync.
- Visual runtime for track C (see the visual-platforms doc) — affects the §5
  bus design.
