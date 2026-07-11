import { test, expect } from '@playwright/test';

// Nav Core's route drives its beacon pitch. That route must advance at the same
// wall-clock rate whether the pane is the hero (60fps) or a throttled rail
// (12fps) — otherwise the pitch "does its thing" 5× slower off-focus.
test('nav core route advances at the same rate regardless of frame rate', async ({ page }) => {
  await page.goto('/screens/screen-02-nav-core.html?embed=1');
  await page.evaluate(() => window.__shipBoot());
  // let the render loop spin up
  await page.waitForTimeout(400);

  // camera position, read off the ticker (GAL.X/Y/Z)
  const readPos = () => page.evaluate(() => ({
    x: parseFloat(document.getElementById('gx').textContent),
    y: parseFloat(document.getElementById('gy').textContent),
    z: parseFloat(document.getElementById('gz').textContent),
  }));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  const measure = async (fps) => {
    await page.evaluate((f) => window.__shipConfig({ fps: f }), fps);
    await page.waitForTimeout(150);
    const a = await readPos();
    await page.waitForTimeout(1500);
    const b = await readPos();
    return dist(a, b);
  };

  const d60 = await measure(60);
  const d12 = await measure(12);

  // time-based → comparable travel; frame-based would make d12 ≈ 0.2 * d60
  expect(d60).toBeGreaterThan(0);
  expect(d12).toBeGreaterThan(0);
  expect(d12).toBeGreaterThan(d60 * 0.6);
});
