import { test, expect } from '@playwright/test';

// Proves the actual "unify the engine" mechanism in isolation: multiple
// ShipAudioEngine instances constructed in the SAME window/realm must share
// one underlying AudioContext + analyser (the expensive, duplicated
// resources today's iframe-per-screen console pays for 10x), while each
// instance keeps its own mute/volume/voices fully independent — matching
// today's per-pane console controls. This is the foundation a future
// no-iframe console host would rely on; today's screens still run one
// instance per iframe, so this only matters when >1 instance shares a realm.
test.describe('ShipAudioEngine: shared core across instances in one realm', () => {
  test('two engines in the same window share one AudioContext + analyser', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const result = await page.evaluate(async () => {
      const a = new window.ShipAudioEngine({ fftSize: 2048 });
      const b = new window.ShipAudioEngine({ fftSize: 2048 });
      await a.start();
      await b.start();
      return {
        sameCtx: a.ctx === b.ctx,
        sameAnalyser: a._core.analyser === b._core.analyser,
        sameCore: a._core === b._core,
        distinctSpatialBus: a._spatialBus !== b._spatialBus,
        distinctMasterGain: a._masterGain !== b._masterGain
      };
    });
    expect(result.sameCtx).toBe(true);
    expect(result.sameAnalyser).toBe(true);
    expect(result.sameCore).toBe(true);
    expect(result.distinctSpatialBus).toBe(true);
    expect(result.distinctMasterGain).toBe(true);
  });

  test('muting one engine does not mute a sibling sharing the same core', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const result = await page.evaluate(async () => {
      const a = new window.ShipAudioEngine({ fftSize: 2048 });
      const b = new window.ShipAudioEngine({ fftSize: 2048 });
      await a.start();
      await b.start();
      a.setMuted(true);
      return { aMuted: a.isMuted(), bMuted: b.isMuted() };
    });
    expect(result.aMuted).toBe(true);
    expect(result.bMuted).toBe(false);
  });

  test('per-instance audio reactivity stays independent against the shared analyser', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const result = await page.evaluate(async () => {
      const a = new window.ShipAudioEngine({ fftSize: 2048 });
      const b = new window.ShipAudioEngine({ fftSize: 2048 });
      await a.start();
      await b.start();
      a.setAudioReactivity(0.2);
      b.setAudioReactivity(2.0);
      return { a: a.getAudioReactivity(), b: b.getAudioReactivity() };
    });
    expect(result.a).toBeCloseTo(0.2, 5);
    expect(result.b).toBeCloseTo(2.0, 5);
  });
});
