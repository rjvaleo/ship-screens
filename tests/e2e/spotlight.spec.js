import { test, expect } from '@playwright/test';

// Exercises the grid-mode spotlight: clicking a module enlarges it over a
// dimmed backdrop while a ghost holds its place in the grid.
test.describe('grid spotlight', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app.html');
    // Engage boots all panes (button is disabled until 10/10 iframes load).
    await page.getByRole('button', { name: 'Engage Console' }).click();
    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.locator('body.grid-view')).toBeVisible();
  });

  test('clicking a module enlarges it over a dimmed backdrop', async ({ page }) => {
    await page.locator('.pane.grid .grid-hit').first().click();

    const spot = page.locator('.pane.grid.spotlight');
    await expect(spot).toHaveCount(1);
    await expect(page.locator('#spot-backdrop.open')).toBeVisible();
    await expect(page.locator('#spot-ghost')).toBeVisible();

    // The enlarged pane should span more than half the viewport width.
    const box = await spot.boundingBox();
    const vw = page.viewportSize().width;
    expect(box.width).toBeGreaterThan(vw * 0.5);

    // Its knob panel (controls) and info bar come along.
    await expect(spot.locator('.inline-panel .knob-row .knob').first()).toBeVisible();
    await expect(spot.locator('.inline-panel .knob-info')).toBeVisible();
  });

  test('Escape and the close button both dismiss the spotlight', async ({ page }) => {
    const hit = page.locator('.pane.grid .grid-hit').first();

    await hit.click();
    await expect(page.locator('.pane.grid.spotlight')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pane.grid.spotlight')).toHaveCount(0);

    await hit.click();
    await page.locator('.pane.grid.spotlight .spot-close').click();
    await expect(page.locator('.pane.grid.spotlight')).toHaveCount(0);
  });

  test('leaving grid mode closes any open spotlight', async ({ page }) => {
    await page.locator('.pane.grid .grid-hit').first().click();
    await expect(page.locator('.pane.grid.spotlight')).toHaveCount(1);
    await page.getByRole('button', { name: 'Solo' }).click();
    await expect(page.locator('.pane.spotlight')).toHaveCount(0);
  });
});
