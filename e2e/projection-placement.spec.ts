import { expect, test } from '@playwright/test';
import { signIn, switchWorkspace, clickRibbon, openPanel, openOutput } from './helpers';
import { emptyShow, newScene, newSurface, quadCorners } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
const row = (page: import('@playwright/test').Page, name: string) => page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });

test('scene shader defaults animate, placement survives resizing and matches the linked output', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await switchWorkspace(page, 'Visualization'); await row(page, 'Scene 1').click();
  await clickRibbon(page, 'Shader');
  const dialog = page.getByRole('region', { name: 'Selection properties' });
  await expect(dialog.getByRole('textbox', { name: 'Asset duration', exact: true })).toHaveValue('15');
  await expect(dialog.getByRole('textbox', { name: 'Loop every', exact: true })).toHaveValue('15');
  // New shaders start the shared transport. Pause before testing deterministic placement.
  await clickRibbon(page, 'Pause');
  await dialog.getByRole('combobox', { name: 'Content placement', exact: true }).selectOption('contain');
  await dialog.getByRole('textbox', { name: 'Asset duration', exact: true }).fill('23');
  await dialog.getByRole('textbox', { name: 'Asset duration', exact: true }).press('Tab');
  await dialog.getByRole('textbox', { name: 'Loop every', exact: true }).fill('23');
  await dialog.getByRole('textbox', { name: 'Loop every', exact: true }).press('Tab');
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const visual = page.locator('.map-output-preview .map-surface > .map-shader');
  await expect(visual).toHaveCount(1);
  const before = await visual.getAttribute('style');
  await row(page, 'Scene 1').click(); await openPanel(page, 'Properties');
  await page.getByRole('combobox', { name: 'Scene size preset', exact: true }).selectOption('portrait');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(visual).not.toHaveAttribute('style', before!);
  const contained = await visual.getAttribute('style');
  const output = await openOutput(page);
  await expect(output.locator('.map-shader')).toHaveAttribute('style', contained!);
  await row(page, 'Scene 1 visual 1').click(); await row(page, 'Scene 1 visual 1').press('ArrowRight');
  await row(page, 'Shader').click(); await openPanel(page, 'Properties');
  await page.getByRole('combobox', { name: 'Content placement', exact: true }).selectOption('cover');
  const filled = await visual.getAttribute('style'); expect(filled).not.toBe(contained);
  await expect(output.locator('.map-shader')).toHaveAttribute('style', filled!);
  await page.getByRole('combobox', { name: 'Content placement', exact: true }).selectOption('stretch');
  const stretched = await visual.getAttribute('style'); expect(stretched).not.toBe(filled);
  await expect(output.locator('.map-shader')).toHaveAttribute('style', stretched!);
  await page.screenshot({ path: info.outputPath('scene-projection.png') }); await output.close();
  await switchWorkspace(page, 'Mapping'); await expect(page.locator('.map-output-preview .map-shader')).toHaveCount(0);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await switchWorkspace(page, 'Visualization'); await expect(visual).toHaveAttribute('style', stretched!);
});

test('output clock follows its linked scene and native shaders change pixels with time', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(); show.playback.mode = 'loop'; show.scenes[0].durationS = 15;
  const surface = newSurface(show.output, 0); surface.corners = quadCorners([0, 0, 1920, 1080]); surface.source.shader = newShader('mesh-gradient');
  show.scenes[0].surfaces = [surface];
  const other = newScene('Editing elsewhere'); other.durationS = 5; show.scenes.push(other); show.activeSceneId = other.id;
  await page.goto('/map/index.html?output=1&session=projection-check'); await expect(page.locator('.map-output')).toBeVisible();
  const send = async (timeS: number) => page.evaluate(({ show, timeS }) => {
    const channel = new BroadcastChannel('aether-map:projection-check'); channel.postMessage({ type: 'show', show, transport: { playing: false, timeS, anchorMs: Date.now() } }); channel.close();
  }, { show, timeS });
  await send(7);
  const shader = page.locator('.map-shader');
  await expect(shader.locator('canvas')).toBeVisible();
  await expect.poll(() => shader.locator(':scope > div').first().evaluate((el: any) => el.paperShaderMount?.getCurrentFrame())).toBe(7000);
  for (const preset of ['tunnel', 'kaleidoscope', 'static-mesh-gradient']) {
    surface.source.shader = newShader(preset); await send(0);
    await expect(shader).toHaveAttribute('data-shader', preset); await expect(shader.locator('canvas')).toBeVisible();
    const initial = await shader.screenshot(); await send(2);
    await expect.poll(async () => (await shader.screenshot()).equals(initial)).toBe(false);
  }
  await page.screenshot({ path: info.outputPath('animated-projection.png') });
});
