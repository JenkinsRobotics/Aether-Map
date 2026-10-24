import { expect, test, type Page, type Locator } from '@playwright/test';
import { clickRibbon, command, openOutput, openPanel, saveShow, signIn, solidPng, switchWorkspace } from './helpers';
async function number(panel: Locator, name: string, value: number) {
  const field = panel.getByRole('textbox', { name, exact: true }); await field.fill(String(value)); await field.press('Enter');
}
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 }); await page.mouse.up();
}
async function box(page: Page) {
  return page.locator('.map-transform-box').evaluate(e => ['x', 'y', 'width', 'height'].map(k => Number(e.getAttribute(k))));
}
// Level 1 is the scene; a layer of that scene is level 2.
const rows = (page: Page) => page.getByRole('tree', { name: 'Layers', exact: true }).locator('[role=treeitem][aria-level="2"]');
test('backdrop and assets share transform handles, snapping, locking, color and saved layers', async ({ page, baseURL }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  const chooser = page.waitForEvent('filechooser'); await clickRibbon(page, 'Import backdrop');
  await (await chooser).setFiles({ name: 'stage.png', mimeType: 'image/png', buffer: solidPng(400, 200, [50, 100, 150]) });
  await expect(rows(page)).toHaveCount(1); await expect(rows(page).first()).toContainText('Backdrop — stage.png');
  await openPanel(page, 'Transform');
  // Panel body has its own accessible region, even when other property windows exist.
  const inspector = page.getByRole('region', { name: 'Layer transform' }).last();
  await number(inspector, 'Layer Width', 800);
  await expect(inspector.getByRole('textbox', { name: 'Layer Height', exact: true })).toHaveValue('400');
  await number(inspector, 'Layer X', 150); await number(inspector, 'Layer Y', 150);
  const before = await box(page); const scale = (await page.locator('.map-raster').boundingBox())!.width / 1920;
  await drag(page, page.locator('.map-transform-box'), 30, 20);
  expect((await box(page))[0]).toBeCloseTo(before[0] + Math.round(30 / scale));
  await page.keyboard.press('Meta+z'); expect(await box(page)).toEqual(before);
  await drag(page, page.locator('[aria-label="Resize e"]'), 20, 0);
  const resized = await box(page); expect(resized[2]).toBeGreaterThan(before[2]); expect(resized[2] / resized[3]).toBeCloseTo(2);
  await page.keyboard.press('Meta+z'); expect(await box(page)).toEqual(before);
  // A move within 6 screen pixels of the raster's left edge snaps exactly.
  await drag(page, page.locator('.map-transform-box'), -150 * scale + 3, 0);
  expect((await box(page))[0]).toBe(0);
  // Rotation uses the separate handle above the box; Shift snaps to 15 degrees.
  const rotationBefore = await box(page);
  const raster = (await page.locator('.map-raster').boundingBox())!;
  const handle = (await page.getByLabel('Rotate layer', { exact: true }).boundingBox())!;
  const cx = raster.x + (rotationBefore[0] + rotationBefore[2] / 2) * scale;
  const cy = raster.y + (rotationBefore[1] + rotationBefore[3] / 2) * scale;
  const radius = cy - (handle.y + handle.height / 2);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.keyboard.down('Shift'); await page.mouse.move(cx + radius, cy, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Shift');
  await expect(inspector.getByRole('textbox', { name: 'Layer rotation', exact: true })).toHaveValue('90');
  await page.keyboard.press('Meta+z'); expect(await box(page)).toEqual(rotationBefore);
  await clickRibbon(page, 'Node'); await expect(page.locator('.map-handle')).toHaveCount(4);
  const backdropImage = page.getByRole('img', { name: 'Backdrop', exact: true });
  const beforeWarp = await backdropImage.getAttribute('style');
  await drag(page, page.locator('.map-handle').first(), 8, 5);
  expect(await backdropImage.getAttribute('style')).not.toBe(beforeWarp);
  await page.keyboard.press('Meta+z'); await expect(backdropImage).toHaveAttribute('style', beforeWarp!);
  await clickRibbon(page, 'Select');
  await inspector.getByRole('button', { name: 'Lock layer', exact: true }).click();
  await expect(page.locator('.map-resize-handle')).toHaveCount(0);
  await expect(await command(page, 'Layer controls', 'Delete layer')).toBeDisabled();
  await page.keyboard.press("Escape");
  await inspector.getByRole('button', { name: 'Unlock layer', exact: true }).click();
  // Toolbar media placement creates a layer, independent of the selected backdrop.
  const media = page.waitForEvent('filechooser'); await clickRibbon(page, 'Add Media');
  await (await media).setFiles({ name: 'art.png', mimeType: 'image/png', buffer: solidPng(320, 180, [180, 40, 90]) });
  await expect(rows(page)).toHaveCount(2); await expect(rows(page).first()).toContainText('art.png');
  await expect(page.getByRole('tree', { name: 'Layers', exact: true })
    .locator('[role=treeitem][aria-selected="true"]')).toContainText('art.png');
  await clickRibbon(page, 'Text'); await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await switchWorkspace(page, 'Visualization');
  await openPanel(page, 'Color');
  const color = page.getByRole('region', { name: 'Layer color', exact: true });
  const hex = color.getByRole('textbox', { name: 'Layer color', exact: true });
  await hex.fill('#22c55e'); await hex.press('Enter');
  await expect(hex).toHaveValue('#22c55e');
  await color.getByRole('slider', { name: 'Layer opacity', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Close Properties', exact: true }).click();
  await page.screenshot({ path: info.outputPath('transform-and-color.png') });
  const output = await openOutput(page);
  await expect(output.locator('.map-surface')).toHaveCount(1);
  await expect(output.locator('.map-setup-background')).toHaveCount(0);
  await saveShow(page, 'Layer authoring'); await page.reload(); await expect(rows(page)).toHaveCount(2);
  await rows(page).last().click(); await expect(page.locator('.map-transform-box')).toHaveAttribute('x', '0');
  await page.screenshot({ path: info.outputPath('transform-color-backdrop.png') });
  expect(errors).toEqual([]); await output.close();
});

test('surface, mask, text and shader layers share resize, rotation and rendering controls', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await openPanel(page, 'Transform');
  const inspector = page.getByRole('region', { name: 'Layer transform' });
  for (const kind of ['New Surface', 'Mask', 'Text', 'Shader']) {
    // A new surface gives content its own geometry; selecting an existing one appends to that track.
    if (kind === 'Text' || kind === 'Shader') {
      await clickRibbon(page, 'New Surface');
    }
    await clickRibbon(page, kind);
    if (kind === 'Text' || kind === 'Shader') await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
    if (kind === 'Shader') await clickRibbon(page, 'Pause');
    await switchWorkspace(page, 'Mapping');
    await openPanel(page, 'Transform');
    await number(inspector, 'Layer Width', 300); await number(inspector, 'Layer Height', 180);
    await number(inspector, 'Layer X', 120); await number(inspector, 'Layer Y', 120);
    const before = await box(page);
    await expect(page.locator('[aria-label="Resize se"]')).toHaveCSS('cursor', 'se-resize');
    await expect(page.locator('[aria-label="Resize e"]')).toHaveCSS('cursor', 'e-resize');
    await drag(page, page.locator('[aria-label="Resize e"]'), 12, 0);
    expect((await box(page))[3]).toBeCloseTo(before[3]);
    await page.keyboard.press('Meta+z'); expect(await box(page)).toEqual(before);
    await drag(page, page.locator('[aria-label="Resize se"]'), 12, 15);
    const after = await box(page); expect(after[2]).toBeGreaterThan(before[2]); expect(after[3]).toBeGreaterThan(before[3]);
    await page.keyboard.press('Meta+z'); expect(await box(page)).toEqual(before);
    await inspector.getByRole('button', { name: 'Lock aspect ratio', exact: true }).click();
    await number(inspector, 'Layer Width', 600); await expect(inspector.getByRole('textbox', { name: 'Layer Height', exact: true })).toHaveValue('360');
    await number(inspector, 'Layer scale percent', 50); await expect(inspector.getByRole('textbox', { name: 'Layer Width', exact: true })).toHaveValue('300');
    await number(inspector, 'Layer rotation', 90);
    await expect(inspector.getByRole('textbox', { name: 'Layer Width', exact: true })).toHaveValue('180');
    await expect(inspector.getByRole('textbox', { name: 'Layer Height', exact: true })).toHaveValue('300');
  }
  await expect(rows(page)).toHaveCount(4);
  await switchWorkspace(page, 'Visualization');
  await openPanel(page, 'Color');
  const color = page.getByRole('region', { name: 'Layer color', exact: true });
  await color.getByRole('combobox', { name: 'Shader palette color' }).selectOption('1');
  await color.getByRole('button', { name: 'Set color #ef4444' }).click();
  await expect(color.getByRole('textbox', { name: 'Layer color', exact: true })).toHaveValue('#ef4444');
  await rows(page).filter({ hasText: 'Mask 2' }).click();
  await color.getByRole('textbox', { name: 'Fill colour', exact: true }).fill('#3b82f6');
  await color.getByRole('textbox', { name: 'Fill colour', exact: true }).press('Tab');
  await expect(page.locator('.map-surface > .map-fill')).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  const output = await openOutput(page); await expect(output.locator('.map-surface')).toHaveCount(4); await output.close();
});
