import { test, expect } from '@playwright/test';

// The air-vent hiss should be fully tunable from the console — every parameter
// surfaced as a knob on the Life Support pane in Grid mode.
test('life support surfaces all air-vent controls in the console', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Engage Console' }).click();
  await page.getByRole('button', { name: 'Grid' }).click();

  // Panes are in MODULES order; index 5 is Life Support.
  const life = page.locator('#console > .pane').nth(5);
  await expect(life.locator('.nm')).toHaveText('Life Support');

  for (const label of ['Air Gain', 'Air Gap', 'Air Tone', 'Air Res', 'Air Length']) {
    await expect(life.locator(`.inline-panel .knob[title="${label}"]`)).toHaveCount(1);
  }
});

test('life support migrates old saved air-control prefs in the console', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('shipConsole', JSON.stringify({
      version: 2,
      preset: 'grid',
      assignment: ['comms-array','nav-core','reactor','threat-matrix','anomaly','life-support','cryo-bay','subspace','ai-core','hull-cameras'],
      panels: {
        'life-support': {
          airGain: 0,
          airGap: 8,
          airCutoff: 12000,
          airQ: 12,
          airDuration: 4
        }
      }
    }));
  });

  await page.goto('/app.html');
  await page.getByRole('button', { name: 'Engage Console' }).click();

  const life = page.locator('#console > .pane').nth(5);
  await expect(life.locator('.inline-panel .knob[title="Air Gain"] .kval')).toHaveText('0.7x');
  await expect(life.locator('.inline-panel .knob[title="Air Gap"] .kval')).toHaveText('2.6s');
  await expect(life.locator('.inline-panel .knob[title="Air Tone"] .kval')).toHaveText('2400');
  await expect(life.locator('.inline-panel .knob[title="Air Res"] .kval')).toHaveText('0.7:1');
  await expect(life.locator('.inline-panel .knob[title="Air Length"] .kval')).toHaveText('1.6s');
});

// The screen accepts the air params over the panel-config hook without error
// (the console relays these through embed.js).
test('life support panel-config accepts air params', async ({ page }) => {
  await page.goto('/screens/screen-06-life-support.html?embed=1');
  const ok = await page.evaluate(() => {
    if (typeof window.__shipPanelConfig !== 'function') return false;
    window.__shipPanelConfig({ airGain: 1.2, airGap: 5, airCutoff: 6000, airQ: 4, airDuration: 1.1 });
    return true;
  });
  expect(ok).toBe(true);
});
