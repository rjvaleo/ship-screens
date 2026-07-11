import { test, expect } from '@playwright/test';

// In Solo/Duo/Trio, clicking a rail thumbnail's body (not just the ⤢ button)
// should promote that module into the center slot.
test.describe('rail thumbnail promote', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app.html');
    await page.getByRole('button', { name: 'Engage Console' }).click();
    await page.getByRole('button', { name: 'Solo' }).click();
  });

  test('clicking a rail thumbnail promotes it to center', async ({ page }) => {
    // DOM order of panes is fixed (never reparented); nth(0) is comms-array,
    // which is a rail in the default Solo layout (nav-core is the hero).
    const pane = page.locator('#console > .pane').nth(0);
    await expect(pane).toHaveClass(/rail/);

    await pane.locator('.grid-hit').click();

    await expect(pane).toHaveClass(/center/);
    await expect(pane).not.toHaveClass(/rail/);
  });

  test('the promoted pane is the only center pane in Solo', async ({ page }) => {
    await page.locator('#console > .pane').nth(2).locator('.grid-hit').click();
    await expect(page.locator('.pane.center')).toHaveCount(1);
  });
});
