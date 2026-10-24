import { expect, test, type Locator } from '@playwright/test';
import { bindOutputScene, clickRibbon, openOutput, openOutputProperties, ribbon, saveShow, signIn, solidPng, openTimeline } from './helpers';

async function number(panel: Locator, name: string, value: number) {
  const field = panel.getByRole('textbox', { name, exact: true });
  await field.fill(String(value)); await field.press('Enter');
}

test('scenes have independent artboards, preserve layers, and save their dimensions', async ({ page, baseURL }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  const controls = page.getByRole('group', { name: 'Layer controls' });
  const scenes = page.getByRole('tree', { name: 'Layers', exact: true });
  const properties = page.getByRole('region', { name: 'Selection properties' });
  const creation = page.getByRole('dialog', { name: 'New scene', exact: true });
  // The canvas lays out an artboard per scene, so ".map-raster" is no longer
  // unique here; this is the one being edited.
  const raster = page.locator('.map-artboard.is-active');

  const backdrop = page.waitForEvent('filechooser'); await clickRibbon(page, 'Import backdrop');
  await (await backdrop).setFiles({ name: 'venue.png', mimeType: 'image/png', buffer: solidPng(600, 400, [50, 100, 150]) });
  const image = page.getByRole('img', { name: 'Backdrop', exact: true });
  await expect(image).toBeVisible(); const before = await image.getAttribute('style');
  await clickRibbon(page, 'New Surface');
  const layerBox = () => page.locator('.map-transform-box').evaluate(e => ['x', 'y', 'width', 'height'].map(k => e.getAttribute(k)));
  const layerBefore = await layerBox();
  // The row's own menu, not the footer: the one toolbar follows the selection,
  // and selecting the scene would drop the layer selection this test is about.
  await scenes.getByRole('treeitem', { name: /Scene 1/ }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Scene properties', exact: true }).click();
  await expect(properties.getByText('Length', { exact: true })).toBeVisible();
  await properties.getByRole('combobox', { name: 'Scene size preset' }).selectOption('square');
  await properties.getByRole('combobox', { name: 'Scene aspect ratio' }).selectOption('4:3');
  await expect(properties.getByRole('textbox', { name: 'Scene height' })).toHaveValue('810');
  await properties.getByRole('combobox', { name: 'Scene orientation' }).selectOption('portrait');
  await expect(properties.getByRole('textbox', { name: 'Scene width' })).toHaveValue('810');
  await properties.getByRole('button', { name: 'Lock aspect ratio', exact: true, pressed: false }).click();
  await number(properties, 'Scene width', 540);
  await expect(properties.getByRole('textbox', { name: 'Scene height' })).toHaveValue('720');
  await page.screenshot({ path: info.outputPath('scene-artboard-properties.png') });
  await properties.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(raster).toHaveCSS('width', '540px'); await expect(raster).toHaveCSS('height', '720px');
  // Reselect the layer: acting on the scene row moved the selection there, and
  // the transform box only exists for a selected layer.
  await scenes.getByRole('treeitem', { name: /Surface 1/ }).first().click();
  await expect(image).toHaveAttribute('style', before!); expect(await layerBox()).toEqual(layerBefore);
  const output = await openOutput(page);
  await expect(output.locator('.map-raster')).toHaveCSS('width', '540px');
  await expect(output.locator('.map-raster')).toHaveCSS('height', '720px');
  await expect(output.locator('.map-setup-background')).toHaveCount(0);

  await controls.getByRole('button', { name: 'New scene', exact: true }).click();
  await expect(creation.getByRole('textbox', { name: 'Scene width' })).toHaveValue('540');
  await creation.getByRole('combobox', { name: 'Scene size preset' }).selectOption('4k');
  await creation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(scenes.locator('[role=treeitem][aria-level="1"]')).toHaveCount(1);
  await controls.getByRole('button', { name: 'New scene', exact: true }).click();
  await creation.getByRole('combobox', { name: 'Scene size preset' }).selectOption('hd');
  await creation.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(raster).toHaveCSS('width', '1280px');
  // The window is still on Scene 1: an output renders only the scene it is
  // linked to, so editing a new scene does not move the projector onto it.
  await expect(output.locator('.map-raster')).toHaveCSS('width', '540px');
  await expect(output.locator('.map-surface')).toHaveCount(1);
  // The crop preview stays visibly anchored to Scene 1. Scene 2 must not
  // inherit the blue output rectangle merely because it is now active.
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(0);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(1);
  await bindOutputScene(page, 'Scene 2');
  await expect(output.locator('.map-raster')).toHaveCSS('width', '1280px');
  await expect(output.locator('.map-surface')).toHaveCount(0);
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(1);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(0);
  // And going back to edit Scene 1 leaves the projector where it was put.
  await scenes.getByRole('treeitem', { name: /Scene 1/ }).first().click();
  await expect(raster).toHaveCSS('width', '540px');
  await expect(output.locator('.map-surface')).toHaveCount(0);
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(0);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(1);
  await bindOutputScene(page, 'Scene 1');
  await expect(output.locator('.map-surface')).toHaveCount(1);
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(1);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(0);
  await openOutputProperties(page);
  await expect(page.getByRole('textbox', { name: 'Crop width', exact: true })).toHaveValue('540');
  await page.getByRole('button', { name: 'Project whole scene', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Crop height', exact: true })).toHaveValue('720');
  const id = await saveShow(page, 'Scene artboards');
  const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL! }, data: { app: 'map', id } });
  expect(response.ok()).toBe(true);
  const saved = JSON.parse(Buffer.from((await response.json()).data_base64, 'base64').toString());
  expect(saved.output.width).toBe(1920); expect(saved.output.height).toBe(1080);
  expect(saved.scenes.map((s: { artboard: unknown }) => s.artboard)).toEqual([{ widthPx: 540, heightPx: 720 }, { widthPx: 1280, heightPx: 720 }]);
  await page.reload(); await expect(raster).toHaveCSS('width', '540px');
  await expect(image).toHaveAttribute('style', before!);
  await scenes.getByRole('treeitem', { name: /Scene 2/ }).first().click();
  await expect(raster).toHaveCSS('width', '1280px');
  await page.screenshot({ path: info.outputPath('scene-artboard-workspace.png') });
  expect(errors).toEqual([]); await output.close();
});

test('continuous scenes keep playing and accept animation beyond sixty seconds', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  // Mapping opens on the Surfaces tray now, and a tray renders only its active
  // workspace, so the timeline's controls exist once the timeline is chosen.
  await openTimeline(page);
  await page.getByRole('button', { name: 'Timeline settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Timeline playback' })).toHaveValue('continuous');
  await page.keyboard.press('Escape');
  await clickRibbon(page, 'New Surface');
  const properties = page.getByRole('region', { name: 'Selection properties' });
  await expect(properties).toBeVisible();
  await number(properties, 'Keyframe time', 121);
  await properties.getByRole('button', { name: 'Add keyframe', exact: true }).click();
  await page.getByRole('button', { name: 'Timeline settings', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Timeline view range' })).toHaveValue('180');
  await page.keyboard.press('Escape');
  await clickRibbon(page, 'Play');
  await expect.poll(async () => Number(await properties.getByRole('textbox', { name: 'Keyframe time' }).inputValue())).toBeGreaterThan(122);
  await expect(ribbon(page, 'Pause')).toBeVisible();
  await clickRibbon(page, 'Pause');
  const id = await saveShow(page, 'Continuous scene');
  const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL! }, data: { app: 'map', id } });
  const saved = JSON.parse(Buffer.from((await response.json()).data_base64, 'base64').toString());
  expect(saved.playback.mode).toBe('continuous');
  expect(saved.scenes[0].surfaces[0].animation.opacity[0].timeS).toBe(121);
  await page.reload();
  await openTimeline(page);
  await page.getByRole('button', { name: 'Timeline settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Timeline playback' })).toHaveValue('continuous');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('continuous-scene-timeline.png') });
});
