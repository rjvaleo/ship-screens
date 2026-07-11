import { test, expect } from '@playwright/test';

// Comms Array should show a second spectrograph (a dupe) to the right of the
// waveform panel, so the bottom row reads: spectrograph | waveform | spectrograph.
test('comms array shows two spectrograph panels flanking the waveform', async ({ page }) => {
  await page.goto('/screens/screen-01-comms-array.html');
  await page.getByRole('button', { name: 'Engage Array' }).click();

  const wf1 = page.locator('#waterfall canvas');
  const wf2 = page.locator('#waterfall2 canvas');
  await expect(wf1).toBeVisible();
  await expect(wf2).toBeVisible();

  const b1 = await wf1.boundingBox();
  const b2 = await wf2.boundingBox();
  const scope = await page.locator('#scope').boundingBox();

  // both spectrographs are actually laid out with real size
  expect(b1.width).toBeGreaterThan(0);
  expect(b2.width).toBeGreaterThan(0);

  // left→right order: waterfall, scope, waterfall2
  expect(scope.x).toBeGreaterThan(b1.x);
  expect(b2.x).toBeGreaterThan(scope.x);
});

// In the console the shell hides #controls; the bottom row should then fill the
// full width rather than leaving the ~260px controls column empty.
test('embedded comms array collapses the controls column (no dead gap)', async ({ page }) => {
  await page.goto('/screens/screen-01-comms-array.html?embed=1');

  await expect(page.locator('#controls')).toBeHidden();

  const bar = await page.locator('#bottombar').boundingBox();
  const wf2 = await page.locator('#waterfall2').boundingBox();

  // second spectrograph's right edge reaches the bottom bar's right edge
  const gap = (bar.x + bar.width) - (wf2.x + wf2.width);
  expect(gap).toBeLessThan(20);
});
