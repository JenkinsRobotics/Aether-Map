import { openBottomDock } from './helpers';
import { emptyShow, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { contentClip } from '../src/surface-assets';
import { expect, test } from '@playwright/test';
import { clickRibbon, openAppSettings, openPanel, signIn, switchWorkspace } from './helpers';

for (const sidebar of ['rail', 'tabs-top'] as const) test(`Mapping Properties follows new and selected items with ${sidebar}`, async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await openAppSettings(page);
  const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
  await settings.getByRole('combobox', { name: 'Sidebar tabs' }).selectOption(sidebar);
  await settings.getByRole('combobox', { name: 'Workspace layout' }).selectOption('floating');
  await settings.getByRole('button', { name: /Close/ }).click();
  const properties = page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Properties"]');
  await expect(properties).toBeVisible();
  await expect(properties.locator('svg')).toHaveCount(1);
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  const outputRow = page.getByRole('tree', { name: 'Outputs', exact: true }).getByRole('treeitem').first();
  await openPanel(page, 'Outputs');
  await outputRow.click();
  await expect(inspector.getByRole('combobox', { name: 'Scene shown on this output' })).toBeVisible();
  await clickRibbon(page, 'New Surface');
  await expect(properties).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Surface 1');
  await inspector.getByRole('textbox', { name: 'Surface name' }).fill('Wall panel');
  await inspector.getByRole('combobox', { name: 'Feature shape' }).selectOption('ellipse');
  const corner = inspector.getByRole('textbox', { name: 'Top left X', exact: true });
  await corner.fill('123'); await corner.press('Tab');
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  const layerRow = tree.getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: /^Wall panel$/ }) });
  await expect(layerRow).toBeVisible();
  await properties.click();
  await layerRow.click();
  await expect(properties).toHaveAttribute('aria-pressed', 'true');
  await expect(corner).toHaveValue('123');
  await expect(inspector.getByRole('combobox', { name: 'Feature shape' })).toHaveValue('ellipse');
  // Sidebar reveal animates its outer width while keeping the editor mounted.
  await expect.poll(() => inspector.evaluate(element => {
    const panel = element.closest('.aui-tabbed-sidebar-content')!;
    const right = panel.getBoundingClientRect().right;
    return panel.scrollWidth <= panel.clientWidth + 1
      && Array.from(element.querySelectorAll('input, select')).every(field => field.getBoundingClientRect().right <= right);
  })).toBe(true);
  await page.screenshot({ path: info.outputPath(`surface-properties-${sidebar}.png`), animations: "disabled" });

  await tree.getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: /^Scene 1$/ }) }).click();
  await expect(inspector.getByRole('textbox', { name: 'Scene length' })).toBeVisible();
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveCount(0);
  await clickRibbon(page, 'New Surface');
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Surface 2');
  await outputRow.click();
  await expect(inspector.getByRole('combobox', { name: 'Scene shown on this output' })).toBeVisible();
  await layerRow.click();
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Wall panel');
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload();
  await layerRow.click();
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Wall panel');
  await expect(inspector.getByRole('combobox', { name: 'Feature shape' })).toHaveValue('ellipse');
  await expect(corner).toHaveValue('123');
});


for (const timed of [false, true]) test(`surface and shader properties stay separate for ${timed ? 'timed children' : 'continuous content'}`, async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.name = 'Wall';
  surface.cues = [{ id: 'surface-opacity-cue', timeS: 5, action: 'opacity', value: .5 }];
  const shader = newShader('tunnel'); shader.parameters.speed = 1;
  surface.source = { mediaId: null, rect: [0, 0, 1920, 1080], shader };
  if (timed) {
    const first = contentClip(surface.source, [], 0, 'shader-a'); first.name = 'Shader A';
    const second = contentClip(surface.source, [], 30, 'shader-b'); second.name = 'Shader B';
    second.source!.shader!.parameters.speed = 2;
    surface.clips = [first, second]; surface.sequence = true;
    surface.source = { mediaId: null, rect: [0, 0, 1920, 1080] };
  }
  show.scenes[0].surfaces = [surface];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Selected feature.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true); const file = await response.json();
  await page.goto(`/map/index.html?document=${file.id}`);
  await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Layers');
  const tree = page.getByRole('tree', { name: 'Layers', exact: true });
  const row = (name: string) => (name.startsWith('Shader') ? page.getByRole('tree', { name: 'Clip index', exact: true }) : tree).getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  await row('Wall').click(); await row('Wall').press('ArrowRight');
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Wall');
  await expect(inspector.getByRole('combobox', { name: 'Surface content' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Shader effect' })).toHaveCount(0);
  await expect(inspector.getByRole('textbox', { name: 'Asset duration' })).toHaveCount(0);
  await openBottomDock(page, 'Timeline');
  await expect(page.getByRole('combobox', { name: 'Animated property', exact: true })).toBeVisible();
  await row(timed ? 'Shader B' : 'Shader').click();
  await expect(page.getByRole('combobox', { name: 'Animated property', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opacity 50%', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Remove cue at/ })).toHaveCount(0);
  await expect(inspector.getByRole('combobox', { name: 'Surface content', exact: true })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Move layer backward', exact: true })).toHaveCount(0);
  await openPanel(page, 'Transform');
  await expect(page.getByRole('textbox', { name: 'Layer X', exact: true })).toHaveCount(0);
  await openPanel(page, 'Color');
  await expect(page.getByRole('region', { name: 'Layer color', exact: true })).toHaveCount(0);
  await openPanel(page, 'Properties');
  const scale = inspector.getByRole('textbox', { name: 'Animation speed', exact: true });
  await expect(scale).toHaveValue(timed ? '2' : '1');
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveCount(0);
  await scale.fill('3'); await scale.press('Tab');
  await row('Wall').click();
  await expect(inspector.getByRole('textbox', { name: 'Animation speed', exact: true })).toHaveCount(0);
  await expect(inspector.getByRole('textbox', { name: 'Surface name' })).toHaveValue('Wall');
  await expect(page.getByRole('combobox', { name: 'Animated property', exact: true })).toBeVisible();
  if (timed) {
    await row('Shader A').click(); await expect(scale).toHaveValue('1');
  }
  // Selecting through the timeline must use the same exact child selection.
  await row('Wall').click();
  if (timed) await page.locator('.map-clip').filter({ hasText: 'Shader B' }).click();
  else await page.getByRole('button', { name: 'Shader · Continuous', exact: true }).click();
  await expect(scale).toHaveValue('3');
  await expect(page.getByRole('combobox', { name: 'Animated property', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Remove cue at/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('selected-shader-properties.png'), animations: 'disabled' });
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await row('Wall').click(); await row('Wall').press('ArrowRight');
  await expect(inspector.getByRole('button', { name: 'Shader effect' })).toHaveCount(0);
  await row(timed ? 'Shader B' : 'Shader').click(); await expect(scale).toHaveValue('3');
});
