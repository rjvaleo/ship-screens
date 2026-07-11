import { test, expect } from '@playwright/test';

test('cryo bay exposes a user-data waveform control in the console', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Engage Console' }).click();
  await page.getByRole('button', { name: 'Grid' }).click();

  // Panes are in MODULES order; index 6 is Cryo Bay.
  const cryo = page.locator('#console > .pane').nth(6);
  await expect(cryo.locator('.nm')).toHaveText('Cryo Bay');
  await expect(cryo.locator('.inline-panel .knob[title="User Data"]')).toHaveCount(1);
  await expect(cryo.locator('.inline-panel .knob[title="User Data"] .kval')).toHaveText('AUDIO');
});

test('cryo bay migrates old saved user-data prefs to audio waveform', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('shipConsole', JSON.stringify({
      preset: 'grid',
      assignment: ['comms-array','nav-core','reactor','threat-matrix','anomaly','life-support','cryo-bay','subspace','ai-core','hull-cameras'],
      panels: { 'cryo-bay': { dataWaveform: 0 } }
    }));
  });

  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Engage Console' }).click();

  const cryo = page.locator('#console > .pane').nth(6);
  await expect(cryo.locator('.inline-panel .knob[title="User Data"] .kval')).toHaveText('AUDIO');
});

test('cryo bay accepts user-data waveform modes', async ({ page }) => {
  await page.goto('/screens/screen-07-cryo-bay.html?embed=1');
  const ok = await page.evaluate(() => {
    if (typeof window.__shipPanelConfig !== 'function') return false;
    for (const dataWaveform of [0, 1, 2, 3]) {
      window.__shipPanelConfig({ dataWaveform });
    }
    return true;
  });
  expect(ok).toBe(true);
});
