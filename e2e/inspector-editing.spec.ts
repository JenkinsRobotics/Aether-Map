import { expect, test, type Page } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { contentClip } from '../src/surface-assets';
import { clickRibbon, openPanel, signIn, switchWorkspace } from './helpers';

const row = (page: Page, name: string) => page.getByRole('tree', { name: name === 'Shader' ? 'Clip index' : 'Layers', exact: true }).getByRole('treeitem')
  .filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });

for (const timed of [false, true]) test(`double-click and Edit use Properties for ${timed ? 'timed' : 'continuous'} shader, surface and scene`, async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), wall = newSurface(show.output, 0);
  wall.name = 'Wall'; wall.source.shader = newShader('tunnel');
  if (timed) { wall.sequence = true; wall.clips = [contentClip(wall.source, [], 0, 'wall-shader')]; }
  show.scenes[0].surfaces = [wall];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Inline shader properties.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await response.json()).id}`);
  await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Layers');
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  await row(page, 'Wall').click(); await row(page, 'Wall').press('ArrowRight');
  await row(page, 'Shader').dblclick();
  const speed = inspector.getByRole('textbox', { name: 'Animation speed', exact: true });
  await expect(speed).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await speed.fill('2.5'); await speed.press('Tab');
  await row(page, 'Shader').dblclick(); await clickRibbon(page, 'Edit feature');
  await expect(speed).toHaveValue('2.5');
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveCount(0);
  await expect(page.locator('.aui-feature-window')).toHaveCount(0);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await row(page, 'Wall').click(); await row(page, 'Wall').press('ArrowRight'); await row(page, 'Shader').dblclick();
  await expect(speed).toHaveValue('2.5');
  await page.screenshot({ path: info.outputPath('shader-inline-properties.png'), animations: 'disabled' });
  await row(page, 'Wall').dblclick();
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Wall');
  await expect(speed).toHaveCount(0);
  await row(page, 'Scene 1').dblclick();
  await expect(inspector.getByRole('combobox', { name: 'Scene size preset', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
