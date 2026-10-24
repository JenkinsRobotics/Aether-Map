import { expect, test, type Page } from '@playwright/test';
import { clickRibbon, signIn, switchWorkspace } from './helpers';

async function expectClearWorkspace(page: Page) {
  await expect(page.locator('.map-production-workspace')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.map-production-workspace')!.getBoundingClientRect();
    const overlaps = (r: DOMRect) => r.width > 0 && r.height > 0 &&
      Math.min(stage.right, r.right) - Math.max(stage.left, r.left) > 1 &&
      Math.min(stage.bottom, r.bottom) - Math.max(stage.top, r.top) > 1;
    const chrome = document.querySelectorAll('.aui-shell-fltoolbar, .aui-shell-fledge, .aui-float-panel, .aui-workspace-bottom-dock > .aui-tabbed-sidebar');
    return stage.width > 100 && stage.height > 50 && !Array.from(chrome).some(el => overlaps(el.getBoundingClientRect()));
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
}

test('Visualization keeps its working table clear of docked and floating widgets', async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await switchWorkspace(page, 'Visualization');
  await expect(page.locator('.aui-shell')).toHaveAttribute('data-content-presentation', 'framed');
  const search = page.getByRole('textbox', { name: 'Search media pool' });
  await search.fill('retained query');
  const stage = await page.locator('.map-production-workspace').elementHandle();
  for (const mode of ['Docked', 'Canvas', 'Floating']) {
    await expectClearWorkspace(page);
    await page.getByRole('button', { name: `Studio mode: ${mode}`, exact: true }).click();
    await expectClearWorkspace(page);
    expect(await stage!.evaluate(el => el.isConnected)).toBe(true);
    await expect(search).toHaveValue('retained query');
  }
  await page.getByRole('button', { name: 'Studio mode: Docked', exact: true }).click();
  await page.getByRole('button', { name: 'Studio mode: Canvas', exact: true }).click();
  await expectClearWorkspace(page);
  await search.fill('');
  await page.getByRole('tab', { name: 'Generators', exact: true }).click();
  await page.getByRole('button', { name: 'New shader', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pool asset properties' })).toBeVisible();
  await expectClearWorkspace(page);
  const zoom = page.locator('.map-output-preview .map-zoom');
  await expect(zoom.getByRole('button', { name: 'Fit', exact: true })).toBeInViewport();
  const outputBounds = (await page.locator('.map-output-preview').boundingBox())!;
  const zoomBounds = (await zoom.boundingBox())!;
  expect(zoomBounds.x).toBeGreaterThanOrEqual(outputBounds.x);
  expect(zoomBounds.y + zoomBounds.height).toBeLessThanOrEqual(outputBounds.y + outputBounds.height);
  await page.screenshot({ path: info.outputPath('visualization-floating.png') });

  const separator = page.getByRole('separator', { name: 'Resize bottom dock', exact: true });
  await separator.focus();
  await separator.press('Shift+ArrowUp');
  await expectClearWorkspace(page);
  await page.setViewportSize({ width: 1200, height: 900 });
  await expectClearWorkspace(page);
  const pool = (await page.getByRole('region', { name: 'Media Pool', exact: true }).boundingBox())!;
  const previews = (await page.locator('.map-preview-panes').boundingBox())!;
  expect(previews.y).toBeGreaterThanOrEqual(pool.y + pool.height - 1);
  await page.getByRole('button', { name: 'Timeline: Surface 1',exact:true }).click();
  await expect(page.getByLabel('Surface 1 composition', { exact: true })).toBeVisible();
  await page.locator('.map-surface-composition-viewport').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('visualization-compact.png') });
  await page.reload();
  await switchWorkspace(page, 'Visualization');
  await expect(page.getByRole('button', { name: 'Studio mode: Floating', exact: true })).toBeVisible();
  await expectClearWorkspace(page);
  await switchWorkspace(page, 'Mapping');
  await expect(page.locator('.aui-shell')).toHaveAttribute('data-content-presentation', 'canvas');
});
