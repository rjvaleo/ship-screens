# No-Iframe Console Migration — Status & Resume Notes

Status: **Paused mid-migration.** Foundation done and tested; the `app.html`
cutover itself has not started. Nothing in this effort is committed to git yet
— see "Repo state" below before doing anything else.

## The ask

From the user: "can we unify the engine, making the whole thing more
efficient - we don't need iFrames either."

Today's console (`app.html`) hosts all 10 screens as separate `<iframe>`s
(`?embed=1`), each with its own `AudioContext`, own Three.js/WebGL context,
own document, own redundant Google Fonts + Three.js CDN fetch. Loading a media
file makes this worse: each iframe independently decodes/plays its own
`<video>` copy of the same file, which drift out of phase with each other.

Two agreed design decisions (asked and confirmed before building):
- **Isolation strategy once iframes are removed:** Shadow DOM per pane
  (not a global id/class rewrite across all 10 screens).
- **Engine sharing depth:** share the `AudioContext` + source + one master
  analyser only. Each module keeps its own generative FX chain / buses / mute
  / volume / reactivity — per-pane console controls stay exactly as
  independent as they are today.

## What's done and proven (safe to build on)

### 1. `shared/audio-engine.js` — split into `EngineCore` + `ModuleChannel`

Rewritten in place. The public `ShipAudioEngine` class name and entire method
surface are **unchanged** — no screen's calling code needed to change.
Internally:

- **`EngineCore`** (private, realm-singleton — `let sharedCore` in the IIFE):
  owns the one `AudioContext`, mic/synth/media source acquisition, the one
  shared `AnalyserNode`, and all media-playback state (`loadMediaFile`,
  `configureMedia`, `mediaTransport`, `getMediaState` — a loaded file is a
  console-wide concept, not per-module, which already matched the "no primary
  pane gating, everything always audible" behavior from earlier this session).
  Created lazily by the first `ShipAudioEngine` constructed in a given
  realm/window; reused by every subsequent one in that *same* window.
- **`ShipAudioEngine`** is now a thin per-module "channel": its own generative
  sound chain (the "sonic profile" filter/pulse/delay/mod/phaser), its own
  `_spatialBus`/`_standardBus`, its own `_masterGain` (mute), its own
  `_audioReactivity`. Reads raw FFT bytes from the core's one shared analyser,
  applies its own reactivity scaling on top — matches old per-instance
  behavior exactly, just against a shared analyser instead of 10 redundant
  ones.

**Important ordering fix already applied:** the channel's own graph
(`_ensureChannelGraph()`) must be built *synchronously* right after
`core.ensureContext()`, **before** awaiting the mic/synth negotiation inside
`core.start()` — not after. The original code built its buses before any
`await` too; moving that after broke `createSpatialVoice()`/`pingStandard()`
for anything called shortly after boot. This is now correct — see the
comment at `ShipAudioEngine.start()`.

**Also fixed:** `ShipAudioEngine`'s constructor used to unconditionally write
`window.__shipEngine = this` (and the other `window.__ship*` bridge
functions). With more than one instance sharing a real `window` (the whole
point of removing iframes), the last one constructed would clobber the
others. Fixed via a transient hint: `mount.js` sets a real (but
synchronously-scoped) `window.__shipMountTarget` immediately before running
each screen's own script and clears it immediately after; the constructor
does `const host = window.__shipMountTarget || window;` and attaches onto
`host` instead of always the true `window`. Standalone/iframe use is
unaffected (`__shipMountTarget` is simply never set there).

**Proof:** [tests/e2e/engine-core-sharing.spec.js](../tests/e2e/engine-core-sharing.spec.js)
— two `ShipAudioEngine` instances constructed in one window share one
`AudioContext`/analyser, while mute and audio-reactivity stay fully
independent per instance.

### 2. `shared/mount.js` — new, no-iframe pane hosting mechanism

Loads a screen's standalone HTML directly into the current document via
Shadow DOM, instead of an `<iframe>`. Exports `window.ShipMount.mount(url,
container, opts) → Promise<{ root, host, windowProxy, boot(), setFps(),
getFps(), panelConfig(cfg) }>`.

**Why shimming is required, not a plain innerHTML injection** (each point
below is a real bug I hit and fixed while proving this out — see git history
of this file / this session's transcript for the exact errors):

- Screens call the bare global `document.getElementById`/`querySelector(All)`.
  Shadow DOM content is **not** reachable via the real `document`'s lookup
  methods — only via the shadow root's own. Fix: wrap each screen's inline
  script in `new Function('document', 'requestAnimationFrame', 'window',
  code)` and call it with per-instance proxies. Because those are the
  function's own parameter names, every bare reference anywhere in that
  script — including deeply nested closures like a render loop — resolves to
  the passed-in proxy, not the true global. No per-screen source rewrites
  needed.
- Screens call the bare global `requestAnimationFrame`. Sharing the one true
  RAF across 10 instances would mean one throttle/fps setting for all of
  them, breaking today's per-pane fps (center 60fps / rail 12fps / grid
  24fps). Fix: `makeRafProxy(getFps)` — a per-instance throttled RAF, same
  logic `shared/embed.js` used to monkey-patch globally, now scoped per pane.
- Some screens assign `window.__shipPanelConfig = fn` (for the console's CTL
  panel). With 10 instances sharing one real `window`, the last one wins.
  Fix: `window` is *also* shimmed (`makeWindowProxy`) — reads (`addEventListener`,
  `ResizeObserver`, sizing) pass through to the real window so global events
  like resize still reach every pane, but arbitrary assignments land as
  normal own-properties on the per-instance proxy object instead. `mount()`'s
  returned handle exposes `panelConfig(cfg)`, which calls
  `windowProxy.__shipPanelConfig` if the screen defined one.
- `shared/audio-engine.js` and `shared/embed.js` are loaded via real
  `<script src>` tags — they run **unshimmed**, in the true global scope
  (this is intentional: the `ShipAudioEngine` *class definition* itself
  should be genuinely global/shared). But that means code *inside* that file
  referencing `window` sees the true global, not any calling screen's shimmed
  proxy — this is the `window.__shipEngine` collision described above, fixed
  via the `__shipMountTarget` hint (a real, transient global, synchronously
  scoped around each screen's own script execution only).
- `<script src>`/`<link>` tags are de-duplicated per realm (`loadedOnce` Set,
  keyed by resolved absolute URL) — Three.js CDN, Google Fonts, and the two
  shared scripts each load once total, not once per mounted screen.
- `new URL(relative, base)` requires `base` itself to already be absolute —
  `mount(url, ...)` resolves its own `url` against `document.baseURI` once
  up front (`absUrl`), then uses that for every relative script/link
  resolution inside the fetched screen.
- Vite's dev server injects `<script type="module" src="/@vite/client">`
  (its HMR client) into every HTML page it serves — including the screen HTML
  `mount()` fetches. Running that through the shim (as a plain, non-module
  script) throws "Cannot use import statement outside a module". Fix:
  `<script type="module">` tags are detected and loaded as real
  `type="module"` script tags appended to the real document head instead —
  the browser's native module loader handles them, unshimmed, exactly as it
  would anywhere else. (Today's 10 screens don't use `type="module"`
  themselves, so this branch is currently Vite-dev-tooling-only, but a future
  ES-module screen would also go through this path correctly.)

**Proof:** [tests/e2e/mount-mechanism.spec.js](../tests/e2e/mount-mechanism.spec.js)
+ fixture [tests/fixtures/mount-harness.html](../tests/fixtures/mount-harness.html)
— mounts **two real, simultaneous instances of Comms Array** with no iframe
involved and proves: (1) true Shadow DOM isolation (real `document` cannot
see into either shadow root at all), (2) both share one `AudioContext` once
booted, (3) per-instance `setFps`/`getFps` and `panelConfig` stay fully
independent (no cross-instance collision).

All 24 E2E tests + 6 unit tests pass as of pausing (full existing suite +
the 3 new spec files above), confirmed via `npx playwright test` and
`npm test`.

## What's NOT done yet — the actual `app.html` cutover

This is the remaining, still-substantial work. None of it has been started.

1. **Replace the iframe-building loop in `app.html`** with `ShipMount.mount()`
   calls into Shadow-DOM-wrapped pane containers. Replace every
   `p.iframe.contentWindow.__ship*(...)` call site with the direct handle
   `mount()` returns instead (`pane.boot()`, `pane.panelConfig(cfg)`, etc.) —
   grep `app.html` for `contentWindow` to find every call site that needs
   updating (`configure()`, `broadcastMediaFile()`, `broadcastMediaConfig()`,
   `promote()`-triggered `layout()`, the Engage-Console handler, etc.).
2. **Port the rest of `shared/embed.js`'s job into the mount layer.** Today
   `embed.js` only activates via `?embed=1` in a *real* iframe URL — that
   condition will never be true once there's no iframe. Its remaining
   responsibilities that `mount.js` doesn't yet cover:
   - Hiding each screen's own boot-overlay/controls (`#boot-overlay`,
     `.float-controls`/`#controls`) when console-hosted — inject a `<style>`
     into each pane's shadow root instead of the iframe-wide one `embed.js`
     injects today.
   - "Minimal" (Grid thumbnail) mode: promoting the screen's main WebGL
     `<canvas>` to fill the frame and hiding text-chrome labels. The
     canvas-detection logic (`querySelectorAll('canvas')` + WebGL-context
     sniffing) needs to run against the pane's own shadow root, not
     `document`.
   - Volume/reactivity/mute application (`__shipConfig({volume, reactivity,
     muted})`) — straightforward once call sites route through the returned
     handle instead of `contentWindow`.
   - Decide whether `shared/embed.js` should be retired entirely for the
     console's own use, or kept as-is for **external** third-party iframe
     embedding of a single screen (CLAUDE.md documents `?embed=1` as a
     general per-screen contract, independent of `app.html` — likely worth
     preserving for that use case even after `app.html` stops using it).
3. **Decide the file-deck-per-instance vs per-realm question for real usage.**
   In the *current* console, each screen's own File Deck is already suppressed
   under `?embed=1`; the shared EngineCore now installs exactly one File Deck
   per realm regardless (harmless today since only 1 channel exists per
   realm). Once 10 channels share one realm, confirm this one-file-deck
   behavior is still what's wanted for standalone use of the *mounted*
   screens (it should be — the console drives media from its own top-bar
   deck, not any per-screen one) — likely no code change needed here, just
   verify via a real multi-pane app.html test once wired up.
4. **Update the QA checklist / CLAUDE.md / README** once the cutover lands:
   remove iframe-specific language in the "Bridge Console + embed hook"
   section, document the Shadow DOM + shared-core architecture instead, and
   note the resource-efficiency win concretely (1 AudioContext instead of 10,
   1 Three.js/Fonts load instead of 10, no more file-playback phasing across
   panes).
5. **Full regression pass** once wired up: the existing Playwright suite
   mostly interacts with `app.html`'s own light-DOM console chrome (pane-bar,
   knobs, spotlight, grid-hit) rather than iframe internals, so it should
   mostly keep working — but re-run everything after the cutover and expect
   to fix a few selector assumptions (e.g. anything that specifically
   expected `.pane iframe` to exist).

## Suggested next steps when resuming

1. Read this doc + skim `shared/mount.js` and the new `EngineCore`/
   `ModuleChannel` split in `shared/audio-engine.js` to reload context.
2. Do item 2 above first (port `embed.js`'s remaining jobs into the mount
   layer) — validate it against the *same* two-instance Comms Array harness
   before touching `app.html`, the same way the current foundation was
   proven, since it's the next-riskiest untested piece.
3. Only then do item 1 (the actual `app.html` cutover), one pane at a time if
   useful, running the full suite continuously.
4. Docs (item 4) last, once behavior is final.

## Repo state at pause

**Nothing from this migration is committed.** `git status --short` shows:

```
 M AGENTS.md
 M CLAUDE.md
 M README.md
 M app.html
 M screens/screen-02-nav-core.html
 M shared/audio-engine.js
?? shared/mount.js
?? tests/e2e/engine-core-sharing.spec.js
?? tests/e2e/media-generative-feed.spec.js
?? tests/e2e/mount-mechanism.spec.js
?? tests/fixtures/
```

Note: the `AGENTS.md`/`CLAUDE.md`/`README.md`/`app.html`/
`screens/screen-02-nav-core.html` diffs are **from earlier in this same
session** (the media-effects-removal / "Feed Generative" / no-primary-pane
work), not from this migration — only `shared/audio-engine.js`'s diff and the
new `shared/mount.js` + test files belong to this effort. Review/commit
strategy (one commit vs. several) is up to you; nothing has been pushed.
