import { expect, test } from '@playwright/test';
import { clickRibbon, openPanel, signIn, switchWorkspace } from './helpers';

test.describe('release tablet smoke', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, reducedMotion: 'reduce' });
  test('touch layouts retain reachable tools, panels and one agent composer in both palettes', async ({ page, baseURL }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await signIn(page, baseURL!);
    await page.goto('/map/index.html?new=show');
    await clickRibbon(page, 'Cube');
    await expect(page.locator('.map-surface')).toHaveCount(3);
    for (const appearance of ['Light', 'Dark']) {
      await page.getByRole('button', { name: /^Appearance / }).click();
      await expect(page.getByRole('button', { name: `Appearance ${appearance}`, exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance.toLowerCase());
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(834);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBe(1194);
      await openPanel(page, 'Aether Agent');
      const composer = page.getByRole('textbox', { name: 'Ask Aether Agent' });
      await expect(composer).toHaveCount(1);
      await expect(composer).toBeInViewport();
      await composer.fill('A blue light sweep across these masks');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByText('A blue light sweep across these masks', { exact: true }).first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(`tablet-${appearance.toLowerCase()}.png`) });
      await page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Aether Agent"]').click();
      await switchWorkspace(page, 'Visualization');
      await switchWorkspace(page, 'Mapping');
      await expect(page.locator('.map-surface')).toHaveCount(3);
    }
    expect(errors).toEqual([]);
  });
});
