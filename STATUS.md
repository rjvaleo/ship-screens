# Project Status

**Development is not complete — this repo has active, unfinished work.**
Before assuming anything is "done," read `docs/NEXT_STEPS.md` for the
prioritized punch list and `docs/` in general for full detail.

## Quick orientation

- **The 10 ship data screens + Bridge Console (`app.html`) are functionally
  complete and working** — this is the Phase-1 browser prototype. Run it with
  `npm run dev` (see `README.md`).
- **An engine/hosting migration is in progress, paused mid-flight.** The goal:
  unify the audio engine (one shared `AudioContext` instead of ten) and drop
  the console's `<iframe>`-per-screen hosting in favor of Shadow DOM. The
  foundation is built and tested (`shared/audio-engine.js`, `shared/mount.js`)
  but **`app.html` itself has not been switched over yet** — it still runs the
  old iframe setup today, and it works. Full detail:
  **[docs/NO_IFRAME_MIGRATION.md](docs/NO_IFRAME_MIGRATION.md)**.
- **A native (JUCE + eventually Unreal) rebuild is planned but not started.**
  Design docs only, no code: **[docs/BUILD_PLAN_JUCE.md](docs/BUILD_PLAN_JUCE.md)**,
  **[docs/VISUAL_PLATFORMS.md](docs/VISUAL_PLATFORMS.md)**.

## Where to look

| Question | Read this |
|---|---|
| "What should I do next?" | `docs/NEXT_STEPS.md` |
| "What's the state of the no-iframe/engine work?" | `docs/NO_IFRAME_MIGRATION.md` |
| "How do I run the current app?" | `README.md` |
| "What are the conventions / hard constraints?" | `CLAUDE.md` / `AGENTS.md` |
| "What's each screen supposed to be?" | `ROADMAP.md` |
| "What's the plan for a native rebuild?" | `docs/BUILD_PLAN_JUCE.md`, `docs/VISUAL_PLATFORMS.md` |

## Verifying "does it still work"

```
npm run dev            # http://localhost:8000/app.html
npm test                # unit
npx playwright test     # full e2e suite
```

As of the last pause point, all tests pass and the console boots/serves
correctly. That does not mean the project is finished — see `docs/NEXT_STEPS.md`.
