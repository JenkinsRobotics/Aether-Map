import { expect, test } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { DEFAULT_MODULATION } from '../src/features/types';
import { openAppSettings, signIn, switchWorkspace } from './helpers';

test('shared parameter rows support exact entry, keyboard sliders and modulation in both themes', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.name = 'Wall';
  surface.source.shader = newShader('tunnel');
  surface.source.shader.modulation = { speed: { ...DEFAULT_MODULATION, source: 'lfo', lfoIndex: 2, range: { min: 1, max: 4 } } };
  show.scenes[0].surfaces = [surface];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Property controls.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await response.json()).id}`);
  await switchWorkspace(page, 'Visualization');
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  const row = (name: string) => tree.getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
  await row('Wall').click(); await row('Wall').press('ArrowRight'); await row('Shader').click();
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  const speed = inspector.getByRole('textbox', { name: 'Animation speed', exact: true });
  const slider = inspector.getByRole('slider', { name: 'Animation speed', exact: true });
  await speed.fill('2+1'); await speed.press('Enter');
  await expect(slider).toHaveValue('3');
  await slider.focus(); await slider.press('ArrowRight');
  await expect(speed).toHaveValue('3.05');
  const badge = inspector.getByRole('button', { name: 'Edit Animation speed modulation' });
  await expect(badge).toHaveText('LFO 3');
  await expect(slider.locator('..').locator('.aui-slider-range-mark')).toHaveCount(2);
  await badge.click();
  await expect(inspector.getByRole('combobox', { name: 'Animation speed source', exact: true })).toBeFocused();
  for (const mode of ['dark', 'light']) {
    await openAppSettings(page);
    const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
    await settings.getByRole('button', { name: 'Appearance & icons', exact: true }).click();
    await settings.getByRole('combobox', { name: 'Color mode' }).selectOption(mode);
    await settings.getByRole('button', { name: /Close/ }).click();
    await slider.scrollIntoViewIfNeeded();
    await expect.poll(() => inspector.locator('.aui-parameter').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await page.screenshot({ path: info.outputPath(`parameter-controls-${mode}.png`) });
    await inspector.locator('.aui-parameter').filter({ has: page.getByRole('slider', { name: 'Animation speed', exact: true }) }).screenshot({ path: info.outputPath(`parameter-row-${mode}.png`) });
  }
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await row('Wall').click(); await row('Wall').press('ArrowRight'); await row('Shader').click();
  await expect(speed).toHaveValue('3.05');
  await expect(badge).toHaveText('LFO 3');
});
