import { expect, test, type Page } from '@playwright/test';
import { emptyShow, newSurface, type MapShow } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { openOutput, openPanel, openTimeline, signIn, switchWorkspace } from './helpers';

const row = (page: Page, name: string) => page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
  .filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
async function selectContent(page: Page, surface: string, content: string) {
  await row(page, surface).click();
  await row(page, surface).press('ArrowRight');
  await row(page, content).click();
}
async function fixture(page: Page, baseURL: string, show: MapShow, name: string) {
  await signIn(page, baseURL);
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL }, data: {
    app: 'map', name: `${name}.aethermap`, scope: 'personal', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true); const file = await response.json();
  await page.goto(`/map/index.html?document=${file.id}`); await expect(page.locator('.map-canvas-host')).toBeVisible();
  return file.id as string;
}
async function setNumber(page: Page, name: string, value: string) {
  const field = page.getByRole('textbox', { name, exact: true }).first(); await field.fill(value); await field.press('Tab');
}

test('mapping visual preview preserves alignment and preference across reload', async ({ page, baseURL }, info) => {
  const show = emptyShow(), surface = newSurface(show.output, 0); surface.name = 'Preview face';
  surface.source.fill = '#ef376a'; show.scenes[0].surfaces = [surface];
  await fixture(page, baseURL!, show, 'Mapping preview'); await switchWorkspace(page, 'Mapping');
  await row(page, 'Preview face').click(); await openPanel(page, 'Properties');
  const pattern = page.locator('.map-artboard .map-surface-grid');
  await expect(pattern).toHaveCount(1); const before = await pattern.getAttribute('style');
  await page.getByRole('checkbox', { name: 'Show visual while mapping' }).check();
  const fill = page.locator('.map-artboard .map-fill'); await expect(fill).toBeVisible();
  expect(await fill.getAttribute('style')).toContain(before!.split(';').find(s => s.includes('matrix3d'))!.trim());
  const output = await openOutput(page); await expect(output.locator('.map-fill')).toHaveCSS('background-color', 'rgb(239, 55, 106)');
  await output.close(); await page.reload(); await switchWorkspace(page, 'Mapping');
  await expect(fill).toBeVisible(); await row(page, 'Preview face').click(); await openPanel(page, 'Properties');
  await expect(page.getByRole('checkbox', { name: 'Show visual while mapping' })).toBeChecked();
  await page.screenshot({ path: info.outputPath('mapping-visual-preview.png') });
  await page.getByRole('checkbox', { name: 'Show visual while mapping' }).uncheck(); await expect(pattern).toHaveCount(1);
});

test('drawn strokes replay on editor and output and survive reopening', async ({ page, baseURL }, info) => {
  const show = emptyShow(), surface = newSurface(show.output, 0); surface.name = 'Painting';
  surface.source.drawing = { strokes: [
    { points: [[100, 100], [500, 100]], widthPx: 30, color: '#ff5577' },
    { points: [[100, 300], [500, 300]], widthPx: 30, color: '#33bbff' },
  ] }; show.scenes[0].surfaces = [surface];
  await fixture(page, baseURL!, show, 'Drawing replay'); await switchWorkspace(page, 'Visualization');
  await selectContent(page, 'Painting', 'Drawing'); await openPanel(page, 'Properties');
  await expect(page.getByRole('combobox', { name: 'Surface content', exact: true })).toHaveValue('drawing');
  await page.getByRole('checkbox', { name: 'Animate strokes' }).check();
  await setNumber(page, 'Drawing replay duration', '8'); await page.getByRole('checkbox', { name: 'Loop drawing' }).uncheck();
  const output = await openOutput(page);
  await openTimeline(page); await row(page, 'Painting').click(); await setNumber(page, 'Keyframe time', '2');
  const stroke = page.locator('.map-artboard .map-drawn polyline').first();
  await expect(stroke).toHaveAttribute('stroke-dashoffset', '0.5');
  await expect(output.locator('.map-drawn polyline').first()).toHaveAttribute('stroke-dashoffset', '0.5');
  await setNumber(page, 'Keyframe time', '6');
  await expect(output.locator('.map-drawn polyline').last()).toHaveAttribute('stroke-dashoffset', '0.5');
  await setNumber(page, 'Keyframe time', '2'); await expect(stroke).toHaveAttribute('stroke-dashoffset', '0.5');
  await page.screenshot({ path: info.outputPath('drawing-replay.png') }); await output.close();
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await switchWorkspace(page, 'Visualization'); await selectContent(page, 'Painting', 'Drawing'); await openPanel(page, 'Properties');
  await expect(page.getByRole('checkbox', { name: 'Animate strokes' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Drawing replay duration', exact: true })).toHaveValue('8');
  await expect(page.getByRole('checkbox', { name: 'Loop drawing' })).not.toBeChecked();
});

test('shared LFO, ranges, flip, clear and A/B/C looks persist', async ({ page, baseURL }, info) => {
  const show = emptyShow(), surface = newSurface(show.output, 0); surface.name = 'Tunnel';
  surface.source.shader = newShader('tunnel'); show.scenes[0].surfaces = [surface];
  const id = await fixture(page, baseURL!, show, 'Parameter controls'); await switchWorkspace(page, 'Visualization');
  await selectContent(page, 'Tunnel', 'Shader'); await openPanel(page, 'Properties');
  await page.getByRole('button', { name: 'Animate a parameter', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Overall scale', exact: true }).click();
  const mod = page.getByRole('region', { name: 'Overall scale modulation', exact: true });
  await mod.getByRole('combobox', { name: 'Overall scale source', exact: true }).selectOption('lfo');
  await mod.getByRole('combobox', { name: 'Overall scale LFO', exact: true }).selectOption('2');
  await mod.getByRole('checkbox', { name: 'Overall scale use range' }).check();
  await setNumber(page, 'Overall scale maximum', '3'); await setNumber(page, 'Overall scale minimum', '.5');
  await setNumber(page, 'Overall scale period', '7');
  await mod.getByRole('button', { name: 'Flip Overall scale modulation' }).click();
  await page.getByRole('button', { name: 'Store preset A', exact: true }).click();
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await page.getByRole('button', { name: 'Recall preset A', exact: true }).click();
  await expect(mod.getByRole('button', { name: 'Flip Overall scale modulation' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL! }, data: { app: 'map', id } });
  const data = await response.json(), saved = JSON.parse(Buffer.from(data.data_base64, 'base64').toString());
  expect(saved.lfos[2].periodS).toBe(7);
  expect(saved.scenes[0].surfaces[0].source.shader.modulation.scale).toMatchObject({ source: 'lfo', lfoIndex: 2, range: { min: .5, max: 3 }, invert: true });
  await page.reload(); await switchWorkspace(page, 'Visualization'); await selectContent(page, 'Tunnel', 'Shader'); await openPanel(page, 'Properties');
  await expect(page.getByRole('textbox', { name: 'Overall scale period', exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: 'Recall preset A', exact: true }).click();
  await mod.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('shared-lfo-controls.png') });
  await page.getByRole('button', { name: 'Clear Overall scale modulation', exact: true }).click(); await expect(mod).toHaveCount(0);
});
