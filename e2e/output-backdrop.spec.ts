import { expect, test } from '@playwright/test';
import { clickRibbon, documentCommand, openOutput, openPanel, signIn, solidPng, switchWorkspace } from './helpers';

test('the last output can be deleted through the tree or toolbar, stays deleted after reload, and closes its window', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'Cube');
  const output = await openOutput(page);
  await switchWorkspace(page, 'Mapping');
  const tree = page.getByRole('tree', { name: 'Outputs', exact: true });
  const rows = tree.getByRole('treeitem');
  await rows.first().click();
  await clickRibbon(page, 'Delete');
  await expect(rows).toHaveCount(0);
  await expect.poll(() => output.isClosed()).toBe(true);
  await expect(page.locator('.map-crop-overlay')).toHaveCount(0);
  await expect(page.locator('.map-surface')).toHaveCount(3);
  await documentCommand(page, 'Undo');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await rows.first().press('Delete');
  await expect(rows).toHaveCount(0);
  await documentCommand(page, 'Undo');
  await rows.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Delete output/ }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload();
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.map-surface')).toHaveCount(3);
  await clickRibbon(page, 'New Output');
  await openPanel(page, 'Outputs');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'More Output controls' }).click();
  await page.getByRole('menuitem', { name: /^Delete output/ }).click();
  await expect(rows).toHaveCount(0);
});

test('an oversized backdrop shows its full bounds only while selected', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  const chooser = page.waitForEvent('filechooser');
  await clickRibbon(page, 'Import backdrop');
  await (await chooser).setFiles({ name: 'reference.png', mimeType: 'image/png', buffer: solidPng(600, 400, [50, 100, 150]) });
  const layers = page.getByRole('tree', { name: 'Layers', exact: true });
  const backdrop = layers.getByRole('treeitem').filter({ hasText: 'Backdrop — reference.png' });
  await backdrop.click();
  await openPanel(page, 'Transform');
  const transform = page.getByRole('region', { name: 'Layer transform' }).first();
  for (const [name, value] of [['Layer Width', '3000'], ['Layer X', '-400'], ['Layer Y', '-300']]) {
    const field = transform.getByRole('textbox', { name, exact: true });
    await field.fill(value); await field.press('Enter');
  }
  await expect(page.locator('.map-scene-clip')).toHaveAttribute('data-unclipped');
  await expect(page.locator('.map-outline.is-selected')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('backdrop-selected.png') });
  await layers.locator('[role="treeitem"][aria-level="1"]').first().click();
  await expect(page.locator('.map-scene-clip')).not.toHaveAttribute('data-unclipped');
  await expect(page.locator('.map-scene-clip')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.map-outline')).toHaveCount(0);
  await expect(page.locator('.map-transform-box')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Backdrop', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('backdrop-trimmed.png') });
  await backdrop.click();
  await expect(page.locator('.map-outline.is-selected')).toHaveCount(1);
  await expect(transform.getByRole('textbox', { name: 'Layer Width', exact: true })).toHaveValue('3000');
});
