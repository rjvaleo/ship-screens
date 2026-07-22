# Visual Platforms — Algorithmic Visuals inside the System

Goal: author visuals **algorithmically / node-based**, run them **inside** the
app, and drive them from the engine's analysis+control bus (see
`BUILD_PLAN_JUCE.md` §5). Evaluated for: node/visual-programming authoring,
audio-reactive DNA, **embeddability** in a JUCE/Unreal host, cross-platform
(Mac+Win), and licensing.

## Options

| Platform | Authoring | Embeds in our app? | Strength | Watch-outs |
|---|---|---|---|---|
| **TouchDesigner + TouchEngine** | Node graph (ops), GLSL, Python | **Yes** — run `.tox` components inside C++/Unreal/Unity via TouchEngine | Gold standard for real-time audio-reactive; huge vocabulary; we/users author networks | Commercial license per seat + TouchEngine terms; heavier runtime |
| **ISF (Interactive Shader Format)** | GLSL fragment shaders + JSON param spec | **Yes** — small open runtime in JUCE's `OpenGLContext` | Lightweight, open, perfect for per-node scopes + simple full-field; portable presets | Shader-only (no 3D scene graph); you build the runtime |
| **Notch (Notch Blocks)** | Node graph, real-time VFX | Partially — Blocks run in supported hosts/media servers | Broadcast/VJ-grade motion graphics + 3D | Windows-centric authoring; commercial; embedding is host-gated |
| **Unreal (Niagara + Material + Blueprint)** | Visual programming, natively | It **is** track C's host | Best 3D world + VFX; already our Visualizer plan | Heavy; separate process/window from JUCE |
| **vvvv gamma** | Node/visual programming (.NET) | Standalone/export | Deep real-time toolkit | Windows-first; less embeddable |
| **Max/MSP + Jitter** | Patch/visual programming | Audio side embeddable via **RNBO→C++**; Jitter visuals **not** embeddable | Familiar patching; RNBO reuses DSP as C++ | Jitter can't ship inside our app |
| **Cables.gl** | Browser node editor (WebGL) | Web export | Great for the browser prototype | Web runtime, not native host |

## Recommendation — a two-tier visual stack

1. **In-host, lightweight → ISF shaders (in JUCE's OpenGL layer).**
   Use ISF for the always-on per-node visualization windows and simple
   full-field looks. It's open, portable, param-driven, and cheap to run right
   next to the audio. Every node ships an ISF preset; the engine's analysis bus
   maps straight to shader uniforms.

2. **Rich algorithmic layer → TouchDesigner via TouchEngine, with Unreal for the 3D world.**
   For the detachable **Visualizer Window**, author node-based, audio-reactive
   compositions in **TouchDesigner** and embed the `.tox` via **TouchEngine** —
   this directly satisfies "algorithmically create visuals within the system"
   and gives us (and later, preset authors) a real visual-programming surface.
   Keep **Unreal (Niagara/Material/Sequencer)** as the high-end **3D world**
   Visualizer for the expanded spatial console.

**Single contract feeds all of them:** the engine publishes audio features +
control data over **OSC** (params) and shares rendered textures via
**Syphon (mac) / Spout (win)**. ISF, TouchEngine, and Unreal all subscribe to
the same bus — so visuals are swappable/stackable without touching the engine.

## Decision needed
- Confirm the two-tier approach (ISF now + TouchEngine/Unreal for rich), or pick
  a single platform to start.
- If TouchDesigner: budget for TouchEngine licensing and confirm Mac+Win target.
- Lock the OSC schema + texture-share method so the bus can be built at the
  `C-link` milestone.
