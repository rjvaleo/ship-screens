import { test, expect } from '@playwright/test';

// Validates shared/mount.js — the no-iframe pane hosting mechanism — against
// two real instances of the same screen (Comms Array) mounted side by side
// in one document via Shadow DOM, with no <iframe> involved. Proves the three
// things the whole "unify the engine, no iframes" effort depends on:
//   1. Each instance is DOM/CSS-scoped correctly (Shadow DOM isolation).
//   2. Once booted, both instances share ONE AudioContext/analyser (the
//      actual efficiency win) via ShipAudioEngine's EngineCore.
//   3. Per-instance concerns stay independent: fps throttling and the
//      window.__shipPanelConfig capture (shimmed per instance, since
//      shared/audio-engine.js itself runs unshimmed and would otherwise
//      collide on the real window across mounted instances).
test.describe('ShipMount: no-iframe pane hosting', () => {
  test('two mounted instances get isolated DOM via Shadow DOM', async ({ page }) => {
    await page.goto('/tests/fixtures/mount-harness.html');
    await page.waitForFunction(() => window.__mountsReady === true);

    const counts = await page.evaluate(() => ({
      aTopbar: window.__mounts.a.root.querySelectorAll('#topbar').length,
      bTopbar: window.__mounts.b.root.querySelectorAll('#topbar').length,
      lightDomTopbar: document.querySelectorAll('#topbar').length
    }));
    expect(counts.aTopbar).toBe(1);
    expect(counts.bTopbar).toBe(1);
    // real document.getElementById/querySelectorAll must NOT reach into
    // shadow roots at all — proves true encapsulation, not just visual scoping
    expect(counts.lightDomTopbar).toBe(0);
  });

  test('booting both instances shares one AudioContext (the actual unification)', async ({ page }) => {
    await page.goto('/tests/fixtures/mount-harness.html');
    await page.waitForFunction(() => window.__mountsReady === true);

    const result = await page.evaluate(() => {
      window.__mounts.a.boot();
      window.__mounts.b.boot();
      const engineA = window.__mounts.a.windowProxy.__shipEngine;
      const engineB = window.__mounts.b.windowProxy.__shipEngine;
      return {
        gotBoth: !!engineA && !!engineB,
        distinctInstances: engineA !== engineB,
        sameCore: !!engineA && !!engineB && engineA._core === engineB._core,
        realWindowUnpolluted: window.__shipEngine === undefined
      };
    });
    expect(result.gotBoth).toBe(true);
    expect(result.distinctInstances).toBe(true);
    expect(result.sameCore).toBe(true);
    // the real global window must stay clean — only the per-instance
    // windowProxy should have received __shipEngine
    expect(result.realWindowUnpolluted).toBe(true);
  });

  test('per-instance fps and panelConfig stay independent (no cross-instance collision)', async ({ page }) => {
    await page.goto('/tests/fixtures/mount-harness.html');
    await page.waitForFunction(() => window.__mountsReady === true);

    await page.evaluate(() => {
      window.__mounts.a.boot();
      window.__mounts.b.boot();
      window.__mounts.a.setFps(12);
      window.__mounts.b.setFps(60);
      window.__mounts.a.panelConfig({ beaconPitch: 0.5 });
      window.__mounts.b.panelConfig({ beaconPitch: 2.0 });
    });
    const state = await page.evaluate(() => ({
      aFps: window.__mounts.a.getFps(),
      bFps: window.__mounts.b.getFps(),
      hasPanelConfigA: typeof window.__mounts.a.windowProxy.__shipPanelConfig === 'function',
      hasPanelConfigB: typeof window.__mounts.b.windowProxy.__shipPanelConfig === 'function'
    }));
    expect(state.aFps).toBe(12);
    expect(state.bFps).toBe(60);
    expect(state.hasPanelConfigA).toBe(true);
    expect(state.hasPanelConfigB).toBe(true);
  });
});
