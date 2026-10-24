import { expect, test, type Page } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { contentClip } from '../src/surface-assets';
import { clickRibbon, documentCommand, openOutput, openPanel, signIn, switchWorkspace } from './helpers';

const row = (page: Page, name: string) => page.getByRole('tree', { name: 'Layers', exact: true })
  .getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
const colors = (page: Page, prefix: string) => page.locator(`${prefix} .map-fill`).evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundColor));

test('scene visual uses ordinary paint order in both the editor and output', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), wall = newSurface(show.output, 0), face = newSurface(show.output, 1);
  wall.name = 'Wall'; wall.source.fill = '#ff0000';
  wall.clips = [{ ...contentClip(wall.source, [], 0, 'red-visual'), name: 'Red visual', durationS: 90 }]; wall.sequence = true;
  face.source.fill = '#0000ff'; show.scenes[0].surfaces = [wall, face];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: { app: 'map', scope: 'personal', name: 'Scene visual order.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64') } });
  await page.goto(`/map/index.html?document=${(await response.json()).id}`);
  await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Layers');
  const assets = page.getByRole('tree', { name: 'Clip index', exact: true });
  await assets.getByText('Red visual', { exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  await inspector.getByRole('tab', { name: 'Targets', exact: true }).click();
  await inspector.getByRole('button', { name: 'Clear targets' }).click();
  await inspector.getByRole('checkbox', { name: 'Scene 1 · Entire scene', exact: true }).check();
  const output = await openOutput(page);
  await expect.poll(() => colors(output, '.map-output')).toEqual(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
  await inspector.getByRole('button', { name: 'Move forward', exact: true }).click();
  await expect.poll(() => colors(output, '.map-output')).toEqual(['rgb(0, 0, 255)', 'rgb(255, 0, 0)']);
  await expect.poll(() => colors(page, '.map-output-preview')).toEqual(['rgb(0, 0, 255)', 'rgb(255, 0, 0)']);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload(); await switchWorkspace(page, 'Visualization');
  await expect.poll(() => colors(page, '.map-output-preview')).toEqual(['rgb(0, 0, 255)', 'rgb(255, 0, 0)']);
  await output.close();
});

test('adding shaders to the scene creates independent layers and undo preserves previous visuals', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Layers');
  for (let i = 1; i <= 2; i++) {
    await row(page, 'Scene 1').click(); await clickRibbon(page, 'Shader');
    await page.getByRole('region', { name: 'Selection properties' }).getByRole('tab', { name: 'Targets', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Scene 1 · Entire scene', exact: true })).toBeChecked();
    await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
    await expect(page.locator('.map-output-preview .map-shader')).toHaveCount(i);
  }
  await row(page, 'Scene 1').click(); await clickRibbon(page, 'Shader');
  await expect(page.locator('.map-output-preview .map-shader')).toHaveCount(3);
  await documentCommand(page, "Undo");
  await expect(page.locator('.map-output-preview .map-shader')).toHaveCount(2);
});
