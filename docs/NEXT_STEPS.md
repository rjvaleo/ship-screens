# Next Steps

Prioritized, actionable punch list across everything currently open in this
repo. Start at the top. See `STATUS.md` (root) for the one-paragraph overview
and `docs/` for the full detail behind each item.

## 1. Finish the no-iframe console migration (active, paused mid-flight)

Full detail, exact file-by-file state, and every bug already found/fixed:
**[NO_IFRAME_MIGRATION.md](NO_IFRAME_MIGRATION.md) — read this first.**

Foundation is done and tested (engine unified into one shared `AudioContext`
via `EngineCore`/`ModuleChannel` in `shared/audio-engine.js`; the no-iframe
Shadow DOM mount mechanism in `shared/mount.js` is proven against two real,
simultaneously-mounted screen instances). `app.html` itself has **not** been
touched yet — it still runs the old iframe-per-screen setup.

Remaining work, in order:

1. Port `shared/embed.js`'s remaining jobs (hide boot-overlay/controls per
   pane, Grid "minimal" canvas promotion, volume/reactivity/mute wiring) into
   `shared/mount.js` or a sibling module. Validate against the two-instance
   Comms Array harness (`tests/fixtures/mount-harness.html`) before touching
   `app.html` — the same proof-first approach the foundation already used.
2. Replace the iframe-building loop in `app.html` with `ShipMount.mount()`
   calls; replace every `p.iframe.contentWindow.__ship*(...)` call site with
   the direct handle `mount()` returns.
3. Decide `shared/embed.js`'s fate for the console specifically vs. keeping it
   for external third-party iframe embedding of a single screen (a documented
   contract in CLAUDE.md, independent of `app.html`).
4. Update CLAUDE.md/README's "Bridge Console + embed hook" section and the QA
   checklist once behavior is final.
5. Full regression pass — re-run `npx playwright test` + `npm test`, expect to
   fix a handful of selectors that assumed `.pane iframe` existed.

## 2. Sweep the docs once the migration lands

- `README.md` "Current highlights" / "Tech stack" sections reference the
  iframe-per-screen model in a few places — revisit once (1) is done.
- Remove the now-stale note in `README.md`'s intro pointing at
  `NO_IFRAME_MIGRATION.md` as "paused" once it's finished.

## 3. Native rebuild planning (separate track, not started)

Two design docs exist but no code has been written against them:

- **[BUILD_PLAN_JUCE.md](BUILD_PLAN_JUCE.md)** — JUCE audio engine + Main
  Window, standalone + VST3/AU. First concrete milestone if picked up: **M0**
  — empty CMake+JUCE project that builds standalone and VST3 on Mac and
  Windows, passing `pluginval`.
- **[VISUAL_PLATFORMS.md](VISUAL_PLATFORMS.md)** — recommends a two-tier
  visual stack (ISF in-host now, TouchDesigner/TouchEngine + Unreal for the
  richer node-based/3D layer later). No decision has been locked in; revisit
  when this track actually starts.

This track is independent of (1)/(2) — the browser app is the Phase-1
prototype either way.

## 4. Housekeeping (low priority, do opportunistically)

- No LICENSE file yet (explicitly deferred earlier — revisit if/when it
  matters for the public repo).
- `docs/screenshots/*.png` (Bridge Console layout captures) should be
  regenerated if `app.html`'s visual layout changes materially (e.g. after
  the no-iframe cutover, in case pane chrome/spacing shifts).
