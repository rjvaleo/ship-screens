# Roadmap — Screens 2–10

Each entry below began as a complete design brief in the same format the
frontend-design process expects: **palette / type / layout / signature**, plus a
**3D** note and an **audio mapping** note (how spectrograph/oscilloscope +
spatial/standard sonification specifically work for that screen — not just
"reuse screen 1's pattern"). All 10 screens are now built and online; keep this
roadmap as the canonical design record and add implementation notes when a
screen gains meaningful new controls or behavior.

Fonts are pre-assigned per screen so the 10-screen set doesn't converge on the
same 2–3 families. All are on Google Fonts.

---

## 2. Nav Core — *Stellar cartography / navigation plotting*

**Palette**
- `--void: #060A12` (cold space-blue black)
- `--starlight: #CFE8FF`
- `--deep-cyan: #2E7D9E`
- `--waypoint-magenta: #B25CC9`
- `--ghost: #6E7A8A`

**Type**: display — *Space Grotesk* (geometric, technical); data — *JetBrains Mono*

**Layout**: full-bleed 3D starfield fills the whole viewport (no side panels
competing for space); a thin top ticker shows galactic coordinates and
heading; a slide-out waypoint list (left edge) shows designation, distance,
ETA.

**Signature**: a glowing **route thread** — a `CatmullRomCurve3` connecting
3–5 waypoints, rendered as a lit tube through the starfield. Camera drifts
slowly along/around it, giving the console a sense of forward travel rather
than a static plot.

**3D**: `THREE.Points` starfield (2,000–4,000 points, subtle parallax via slow
camera drift), diamond-shaped waypoint markers (`OctahedronGeometry`), the
route tube (`TubeGeometry` along the Catmull-Rom curve).

**Audio mapping**: distance-to-next-waypoint drives a **doppler-style pitch
sonification** — frequency rises as a simulated waypoint approach tightens.
Spatial sonification: each waypoint beacon is a persistent spatial voice
positioned at its 3D marker, so bearing is audible. Standard sonification: a
distinct arrival chime plays (non-spatial, centered) when a waypoint
threshold is crossed. Spectrograph: keep it linear like screen 1 for
contrast is fine here since the *shape* of the console (full-bleed starfield,
no waterfall panel at all — fold frequency data into the route tube's glow
intensity instead) is what differentiates it. Consider dropping the
dedicated waterfall panel entirely for this screen since the 3D view *is*
the primary display — use the freed space for the waypoint list.

---

## 3. Reactor — *Engineering core telemetry*

**Palette**
- `--void-iron: #0C0F0A`
- `--hazard-orange: #FF6B1A`
- `--containment-teal: #1FA8A0`
- `--warn-yellow: #F2C94C`
- `--soot: #2B2B26`

**Type**: display — *Oswald* (bold, condensed, industrial); data — *IBM Plex Mono*

**Layout**: central 3D containment visualization dominates; radial gauge
cluster (temp / pressure / flux) down the left in the classic multi-dial
instrument-panel arrangement; scrolling telemetry log (text, not chart) along
the bottom instead of a waveform.

**Signature**: the containment field itself — a `TorusGeometry` (or
`TorusKnotGeometry`) with **per-vertex displacement driven by the bass band**
of the FFT, so the "plasma" visibly deforms/breathes in sync with low-end
audio energy. This is the screen's one bold risk — lean into it, keep
everything else (gauges, log) quiet and disciplined per the frontend-design
restraint principle.

**3D**: displaced torus (recompute vertex positions each frame from a base
geometry + noise function scaled by bass-band amplitude), particle "sparks"
(small `THREE.Points` bursts) triggered on bass transients, radial gauge
needles as thin rotated `BoxGeometry` or 2D canvas overlays.

**Audio mapping**: spectrograph rendered as a **thermal gradient** (not
amber) — blue/teal at low intensity through yellow/orange at high, echoing
heat-map conventions rather than the classic radar-waterfall look. Standard
sonification carries the primary alert language here: industrial
klaxon/clunk tones on threshold breach (e.g. simulated pressure exceeding a
limit). Spatial sonification: a single voice representing a simulated
"breach" location that can appear at a random bearing — used sparingly, as an
alert, not a constant ambience like screen 1's contacts.

---

## 4. Threat Matrix — *Tactical targeting radar*

**Palette**
- `--void-black: #060505`
- `--threat-red: #FF3B30`
- `--targeting-white: #F5F5F0`
- `--caution-amber: #FFB020`
- `--grid-grey: #3A2323`

**Type**: display — *Rajdhani* Bold (angular, military-adjacent); data — *Roboto Mono*

**Layout**: circular sweep radar as the centerpiece (classic rotating-sweep
composition, but rendered in 3D rather than flat 2D), target roster with lock
status on the right, threat-level bar graph along the bottom.

**Signature**: a literal **rotating sweep plane** — a thin translucent wedge
mesh spinning around the vertical axis, casting a fading trail. Targets only
become visible/audible for a moment as the sweep passes over them, then fade
— this makes time itself part of the interface, unlike every other screen's
continuous readouts.

**3D**: rotating wedge (`RingGeometry` sector or custom `BufferGeometry`)
with a shader-free fade via decreasing opacity across a few trailing copies;
target blips as small tetrahedra that flash on sweep contact; lock-on
brackets (line geometry) around a designated target.

**Audio mapping**: standard sonification is the star here — a clean, classic
radar **ping exactly when the sweep crosses a target** (deterministic timing
tied to the sweep's rotation angle vs. each target's bearing, not just
amplitude-triggered). Spatial sonification: ambient low-level "hostile
contact" drones placed at each target's bearing, audible continuously but
very quiet, swelling briefly when the sweep passes (ties the two
sonification modes together rather than treating them as unrelated toggles).
Spectrograph relabeled/framed as a "signature analysis" panel for the
currently locked target rather than a general ambient waterfall.

---

## 5. Anomaly — *Xenoscience / anomaly detection*

**Palette**
- `--void-violet: #0A0714`
- `--anomaly-green: #6EFFB2`
- `--glitch-magenta: #FF2E9A`
- `--static-white: #E8E8F0`
- `--warn-violet: #7A4FE0`

**Type**: display — *Major Mono Display* (unusual, used sparingly — just the
title/header) with body/labels falling back to *Space Mono* for readability;
data — *Space Mono*

**Layout**: deliberately asymmetric grid that subtly jitters (small random
translation on a slow interval, a few px, not seizure-inducing) — the only
screen in the set where the *chrome itself* feels unstable. Central viewport
shows a distorting point-cloud; a side panel shows fluctuating
probability/confidence readouts that occasionally flicker or briefly show
`ERR` before resolving.

**Signature**: **transient-triggered glitch artifacts** — on detected audio
transients (frame-to-frame spectral flux spike), briefly split the canvas
into RGB channel offsets and add a scanline tear, synced to the same moment
a geometry distorts. Use restraint: glitches should be rare/sharp, not
constant, or they stop reading as anomalous.

**3D**: an icosahedron or point cloud with per-vertex noise displacement,
amplitude of displacement driven by transient detection rather than raw
level (spikes, not steady amplitude).

**Audio mapping**: implement simple **transient/spike detection** in the
screen's own script (compare current frame's frequency data to a rolling
average; flag a spike when a bin exceeds it by a threshold — see CLAUDE.md,
this kind of logic belongs in the screen, not the shared engine). Spatial
sonification: on each detected transient, spawn an **ephemeral** spatial
voice at a randomized 3D position that plays a brief tone and is immediately
torn down — contacts appear and vanish, unlike screen 1's persistent voices.
Standard sonification: sparse, low sub-bass rumbles, non-rhythmic.

---

## 6. Life Support — *Atmospherics & environmental systems*

**Palette**
- `--void-teal: #071410`
- `--oxygen-green: #7FD858`
- `--warn-coral: #FF8566`
- `--filtered-blue: #6FB7C9`
- `--bone: #E9E4D8`

**Type**: display — *Manrope* Semibold (humanist, calm); data — *Fira Code*

**Layout**: a top-down 3D deck-plan (layered translucent rings representing
ship decks) as the centerpiece, with per-zone O2/CO2/temp/humidity readouts
arranged around the ring rather than in a side list — position encodes
location.

**Signature**: a **breathing ring** — a geometry that gently scales in/out at
a human respiration-like rate (roughly 12–16 cycles/minute), independent of
audio input. This is the one screen whose primary animation rhythm is *not*
driven by sound — a deliberate contrast that makes the console feel humane
rather than purely reactive, per its subject.

**3D**: stacked translucent disc/ring geometries (one per deck), colored per
zone by simulated air-quality value, slow independent rotation per layer.

**Audio mapping**: gentle, sparse standard sonification — a soft chime per
zone only when a simulated parameter drifts out of safe range (rare, not
constant). Spatial sonification maps each zone alarm to its physical position
around the ring, so an alert audibly comes from the correct "deck section."
Spectrograph rendered as a **soft flowing gradient fill** (area chart style,
smoothed) rather than screen 1's hard-edged waterfall lines — same
underlying FFT data, calmer presentation, matching the mood.

**Implementation note**: Life Support now includes a tunable air-vent hiss
layer in addition to zone alarms. The Bridge Console exposes `Air Gain`,
`Air Gap`, `Air Tone`, `Air Res`, and `Air Length` as CTL/knob controls, with
preference migration coverage so old saved console settings do not pin stale
values.

---

## 7. Cryo Bay — *Medical / cryo-stasis monitoring*

**Palette** — dark clinical slate (was originally light-mode; re-themed dark
so it doesn't glare as a white tile in the unified Bridge Console):
- `--paper: #0A141A` (cold cryo slate)
- `--card: #0F1E26`
- `--clinical-blue: #4FA3C7`
- `--vitals-red: #F2586E`
- `--frost: #9FD2DD`
- `--ink: #DCE9ED`

**Type**: display — *IBM Plex Sans* Medium (clean, clinical); data — *IBM Plex Mono*

**Layout**: a grid of pod status cards (hospital-monitor-tile composition),
each with its own mini scrolling vitals waveform; a central 3D wireframe
cryo-pod shows whichever pod is currently selected.

**Signature**: vitals waveforms are sonified from **simulated derived data**
(a pod's internal stability variance) rather than raw microphone/synth audio
directly — showing a different sonification *source*, not just a different
mapping. (The original brief made the light background the signature risk;
that was reverted to a dark clinical palette for console cohesion, so the
sonification-source idea now carries the screen's distinctiveness.)

**3D**: a wireframe capsule pod — build from `CylinderGeometry` (body) +
`SphereGeometry` caps (r128 has no `CapsuleGeometry`, see CLAUDE.md), with a
soft inner glow mesh representing the occupant.

**Audio mapping**: standard sonification = a classic medical monitor "beep"
per simulated heartbeat cycle, deterministic timing, amplitude-modulated by
that pod's stability value (not by mic input). Spatial sonification: each
pod's beep is positioned at that pod's location in the bay, so multiple pods
beeping creates a layered, spatially distributed rhythm — an ensemble effect
none of the other screens produce. The waterfall/spectrograph panel can be
reframed as a compact strip per pod card rather than one large panel.

**Implementation note**: Cryo Bay now exposes a Bridge Console `User Data`
control for each pod's mini-waveform display: `ECG`, `STAB`, `TEMP`, or
`AUDIO`. The default `AUDIO` mode uses the same time-domain oscilloscope
language as Comms Array, with a cyan waveform and amber level meter.

---

## 8. Subspace — *FTL / warp field harmonics*

**Palette**
- `--void-indigo: #05040F`
- `--warp-violet: #8B5CF6`
- `--field-cyan: #4DE8E0`
- `--flare-white: #F4F0FF`
- `--tension-magenta: #C23FBE`

**Type**: display — *Sora* (modern geometric); data — *Space Mono*

**Layout**: full-bleed 3D field-line visualization; a harmonic-series ladder
(piano-roll-like vertical bars) down one side instead of a target/contact
list; bottom panel holds an **XY (Lissajous) scope** rather than a linear
oscilloscope.

**Signature**: the **Lissajous scope** — plot one frequency band's amplitude
against another (or left/right channel if using stereo input) as an X/Y
trace instead of amplitude-over-time. It produces genuinely different,
looping geometric patterns and is a real technique from analog synth/warp
fiction visuals, not just a reskin of screen 1's scope.

**3D**: warped field lines — `TubeGeometry` following sine-distorted curves
whose distortion amplitude responds to the dominant FFT peak (standing-wave
look), arranged in a grid/tunnel around the camera.

**Audio mapping**: standard sonification maps dominant FFT peaks onto a
**harmonic series** of a fundamental tone (musical overtones) rather than
arbitrary pitches — a distinctly "musical" sonification approach versus the
other screens' alert/ping language. Spatial sonification: a single voice
(not per-contact) continuously orbits the listener, representing overall
field rotation — motion as ambience rather than discrete located objects.

---

## 9. AI Core — *Ship neural substrate visualization*

**Palette**
- `--void-black: #04070A`
- `--synapse-cyan: #4FF0D6`
- `--thought-pink: #FF5EA8`
- `--core-white: #EAF7F5`
- `--dim-slate: #24343A`

**Type**: display — *Archivo Expanded* Bold (wide, confident); data — *Red Hat Mono* (fallback *JetBrains Mono*)

**Layout**: a 3D neural node-graph fills the main viewport; a scrolling
"process log" of simulated system messages runs down one side instead of any
numeric readout list.

**Signature**: a **radial spectrograph** instead of a linear waterfall —
frequency bins drawn as spokes radiating from a central point that doubles
as the neural core, so the audio visualization and the "brain" visual
metaphor are literally the same shape. This is the set's other structural
departure (alongside Threat Matrix's sweep and Subspace's Lissajous scope)
from the screen-1 waterfall pattern.

**3D**: 100–300 small nodes loosely clustered in a sphere (`Points` or many
small meshes), thin edges between nearby nodes, cascading activation pulses
(brief gain/emissive ramps traveling along edges) triggered by audio
transients.

**Audio mapping**: standard sonification = short "thought" blips triggered
on random node activations, pitch derived from each node's position (a
simple hash of coordinates → frequency) rather than from audio data directly
— sonifying the *visualization's own state*, a third distinct sonification
source alongside "raw audio" (screen 1) and "derived/simulated vitals"
(Cryo Bay). Spatial sonification: as a cascade travels between nodes, its
sound pans from the source node's 3D position toward the listener,
reinforcing a sense of motion through the graph.

---

## 10. Hull Cameras — *External optical array*

**Palette**
- `--void-charcoal: #0B0C0D`
- `--viewfinder-green: #39FF6A` (a deliberate, restrained CCTV/night-vision
  reference — used as the *only* accent on this screen so it reads as a
  genre nod rather than a cliché)
- `--alert-red: #E8483B`
- `--chrome-grey: #9CA3A0`
- `--sensor-amber: #E0A458`

**Type**: display — *Titillium Web* (technical, aerospace-adjacent); data — *Cousine* (fallback *Space Mono*)

**Layout**: a **2×2 quad camera-feed grid** — the one screen in the set that
splits into four viewports instead of one large one. Each feed has its own
small HUD overlay (crosshair, timestamp, feed label like `CAM-02 · AFT`).

**Signature**: all four feeds render the **same shared 3D scene** (a drifting
debris/rock field) from four different camera angles, via four separate
`THREE.WebGLRenderer.setViewport` regions in one canvas (or four small
renderers) — a genuinely different composition strategy from every other
screen's single viewport.

**3D**: one shared scene with 15–25 drifting debris objects
(`IcosahedronGeometry`, random rotation/drift), dramatic single-key lighting;
four `PerspectiveCamera`s positioned around the scene, each rendered into its
own grid cell each frame.

**Audio mapping**: standard sonification = a proximity alert beep when a
simulated debris object crosses a distance threshold from the ship,
amplitude-modulated by how close it gets. Spatial sonification: each debris
object gets a brief spatial "ping" positioned to match its nearest camera
angle, reinforcing which feed to look at. The spectrograph becomes a single
thin shared strip along the bottom, spanning the full width under all four
feeds, rather than a dedicated per-screen panel.

---

## Build order recap

The original build order was 2 → 10, same as screen 1. That sequence is now
complete. Future screen or console work should still follow the CLAUDE.md /
AGENTS.md QA checklist: verify standalone + embedded behavior, media-file
reactivity, synth fallback, Grid spotlight/minimal mode, and any panel-control
preference migrations before marking the work done.
