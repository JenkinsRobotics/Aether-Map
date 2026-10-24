import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { emptyShow, newSurface, newScene, quadCorners } from '../src/document';
import { documentCommand, openPanel, signIn, solidPng, switchWorkspace } from './helpers';

function unpackZip(data: Buffer) {
  const files: Record<string, Buffer> = {}; let p = 0;
  while (data.readUInt32LE(p) === 0x04034b50) {
    expect(data.readUInt16LE(p + 8)).toBe(0);
    const length = data.readUInt32LE(p + 18), names = data.readUInt16LE(p + 26), extra = data.readUInt16LE(p + 28);
    const name = data.subarray(p + 30, p + 30 + names).toString('utf8'), start = p + 30 + names + extra;
    files[name] = data.subarray(start, start + length); p = start + length;
  }
  return files;
}
async function pixels(page: Page, png: Buffer, points: number[][]) {
  return page.evaluate(async ({ data, points }) => {
    const img = new Image(); img.src = data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return { size: [c.width, c.height], colors: points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]) };
  }, { data: `data:image/png;base64,${png.toString('base64')}`, points });
}
const row = (page: Page, name: string) => page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
  .filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });

test('projection briefs export current curves, holes, alpha masks, cutouts and backdrop with isolated agent context', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.addInitScript(() => localStorage.setItem('aether-appearance', 'light')); await page.goto('/map/index.html?new=show');
  const alpha = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 60;
    const ctx = c.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(30, 0, 30, 60); return c.toDataURL(); });
  const show = emptyShow(); show.output = { width: 320, height: 180 };
  const scene = show.scenes[0]; scene.name = 'Front'; scene.artboard = { widthPx: 320, heightPx: 180 };
  const wall = newSurface(show.output, 0); wall.name = 'Curved wall'; wall.corners = quadCorners([10, 10, 100, 120]); wall.source.rect = [0, 0, 100, 120];
  wall.masks = [wall.corners, quadCorners([30, 40, 30, 30])]; wall.maskFillRule = 'evenodd';
  wall.maskCurves = [[{ c1: [40, 30], c2: [60, 30] }, null, null, null], []];
  const ellipse = newSurface(show.output, 1); ellipse.name = 'Round window'; ellipse.corners = quadCorners([160, 10, 60, 60]); ellipse.source.rect = [0, 0, 60, 60]; ellipse.shape = 'ellipse';
  const text = newSurface(show.output, 2); text.name = 'Alpha silhouette'; text.corners = quadCorners([160, 90, 60, 60]); text.source.rect = [0, 0, 60, 60]; text.alphaMask = { png: alpha };
  const cutout = newSurface(show.output, 3); cutout.name = 'Cutout'; cutout.kind = 'mask'; cutout.corners = quadCorners([80, 80, 15, 15]); cutout.source.rect = [0, 0, 15, 15];
  scene.surfaces = [wall, ellipse, text, cutout];
  const mediaFile = `reference-${Date.now()}.png`, image = solidPng(320, 180, [25, 120, 75]);
  expect((await page.request.put(`/api/map/media/${mediaFile}`, { headers: { Origin: baseURL!, 'Content-Type': 'image/png' }, data: image })).ok()).toBe(true);
  show.media = [{ id: 'reference', file: mediaFile, name: 'Facade', kind: 'image', width: 320, height: 180, bytes: image.length }];
  scene.setupBackground = { mediaId: 'reference', visible: true, opacity: 1, corners: quadCorners([0, 0, 320, 180]) };
  const side = newScene('Side'); side.artboard = { widthPx: 320, heightPx: 180 }; show.scenes.push(side);
  const created = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', kind: 'file', name: 'Export test.aethermap', scope: 'personal', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } }); expect(created.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await created.json()).id}`);
  await row(page, 'Curved wall').click(); await openPanel(page, 'Aether Agent');
  const propertiesToggle = page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Properties"]');
  if (await propertiesToggle.getAttribute('aria-pressed') === 'true') await propertiesToggle.click();
  const panel = page.getByRole('region', { name: 'Projection assistant' });
  await expect(panel.getByText('Not connected · Prompts stay local', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'voice mode' })).toHaveCount(0);
  await panel.getByRole('textbox', { name: 'Ask Aether Agent' }).fill('Create moving golden light following this architecture.');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.getByRole('textbox')).toHaveCount(1);
  await panel.getByLabel('Agent options', { exact: true }).click();
  await panel.getByRole('textbox', { name: 'Brief animation duration' }).fill('23');
  await panel.getByRole('textbox', { name: 'Brief animation duration' }).blur();
  await panel.getByLabel('Agent options', { exact: true }).click();
  await panel.getByRole('button', { name: 'Add context' }).click();
  await page.getByRole('menuitemradio', { name: 'Selected surfaces' }).click();
  await expect(panel.getByLabel('Agent selection')).toHaveText('Curved wall');
  await panel.getByLabel('Agent options', { exact: true }).click();
  let download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Download creative brief' }).click();
  const first = await download; await first.saveAs(info.outputPath('selected-brief.zip'));
  let files = unpackZip(await readFile((await first.path())!)); let manifest = JSON.parse(files['manifest.json'].toString());
  expect(manifest.targetSurfaceIDs).toEqual([wall.id]); expect(manifest.durationS).toBe(23);
  expect(files['mapping.svg'].toString()).toContain('C40,30 60,30');
  expect(files['mapping.svg'].toString()).toContain('fill-rule="evenodd"');
  expect((await pixels(page, files['target-mask.png'], [[20, 80], [45, 55], [85, 85], [190, 40]])).colors)
    .toEqual([[255,255,255,255], [0,0,0,255], [0,0,0,255], [0,0,0,255]]);
  expect((await pixels(page, files['reference.png'], [[150, 100]])).colors).toEqual([[25,120,75,255]]);
  await panel.getByRole('button', { name: 'Add context' }).click();
  await page.getByRole('menuitemradio', { name: 'Front', exact: true }).click();
  await panel.getByLabel('Agent options', { exact: true }).click();
  download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Download creative brief' }).click();
  const full = await download; await full.saveAs(info.outputPath('scene-brief.zip'));
  files = unpackZip(await readFile((await full.path())!));
  expect((await pixels(page, files['mask.png'], [[160, 10], [190, 40], [175, 120], [205, 120]])).colors)
    .toEqual([[0,0,0,255], [255,255,255,255], [0,0,0,255], [255,255,255,255]]);
  expect((await pixels(page, files['target-mask.png'], [[300, 160], [85, 85]])).colors).toEqual([[255,255,255,255], [0,0,0,255]]);
  await expect(panel.getByRole('textbox')).toHaveCount(1);
  const composerBox = await panel.locator('.aui-agent-chat__composer').boundingBox();
  const panelBox = await panel.boundingBox();
  // The shared advisor now includes connection status and a review reminder
  // below the composer. Verify the whole footer is anchored and contained.
  const footerBox = await panel.locator('.aui-agent-chat__bottom').boundingBox();
  expect(composerBox!.y).toBeGreaterThanOrEqual(footerBox!.y);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(footerBox!.y + footerBox!.height);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);
  expect(panelBox!.y + panelBox!.height - footerBox!.y - footerBox!.height).toBeLessThan(20);
  await expect(panel.locator('.aui-agent-chat__status')).toBeVisible();
  await expect(panel.locator('.aui-agent-chat__disclaimer')).toBeVisible();
  await page.screenshot({ path: info.outputPath('agent-projection-brief.png') });
  await page.getByRole('button', { name: 'Appearance Light' }).click();
  await expect(page.getByRole('button', { name: 'Appearance Dark' })).toBeVisible();
  await page.mouse.move(800, 280);
  await page.screenshot({ path: info.outputPath('agent-projection-brief-dark.png'), animations: 'disabled' });
  download = page.waitForEvent('download'); await documentCommand(page, 'Download mapping as SVG');
  const svg = (await readFile((await (await download).path())!)).toString();
  expect(svg).toContain('translate(0 228)'); expect(svg).toContain('C40,30 60,30');
  await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Aether Agent');
  await expect(panel.locator('.aui-assistant-panel__message')).toHaveText('Create moving golden light following this architecture.');
  await panel.getByLabel('Agent options', { exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Brief animation duration' })).toHaveValue('23');
  await panel.getByLabel('Agent options', { exact: true }).click();
  await openPanel(page, 'Layers');
  await row(page, 'Side').click();
  await expect(panel.locator('.aui-assistant-panel__message')).toHaveCount(0);
  await panel.getByLabel('Agent options', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Download creative brief' })).toBeDisabled();
  await panel.getByLabel('Agent options', { exact: true }).click();
  await panel.getByRole('textbox', { name: 'Ask Aether Agent' }).fill('Draft');
  await panel.getByRole('textbox', { name: 'Ask Aether Agent' }).press('Shift+Enter');
  await expect(panel.locator('.aui-assistant-panel__message')).toHaveCount(0);
  await panel.getByRole('textbox', { name: 'Ask Aether Agent' }).press('Enter');
  await expect(panel.locator('.aui-assistant-panel__message')).toHaveText('Draft');
  await panel.getByRole('button', { name: 'New chat' }).click();
  await expect(panel.getByRole('textbox', { name: 'Ask Aether Agent' })).toHaveValue('');
  const compactComposer = await panel.locator('.aui-agent-chat__composer').boundingBox();
  const compactPanel = await panel.boundingBox();
  expect(compactComposer!.y + compactComposer!.height).toBeLessThanOrEqual(compactPanel!.y + compactPanel!.height);
  if (await propertiesToggle.getAttribute('aria-pressed') === 'true') await propertiesToggle.click();
  await page.screenshot({ path: info.outputPath('agent-empty-dark.png'), animations: 'disabled' });
});


test('Mapping export tab downloads editable SVG and reference package from current document', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.addInitScript(() => localStorage.setItem('aether-appearance', 'light')); await page.goto('/map/index.html?new=show');
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({ name: 'curved.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><path id="Curve" d="M10 10 C200 20 100 250 300 300 L10 300Z"/></svg>') });
  await page.getByRole('button', { name:'Document controls', exact:true }).click();
  await page.getByRole('menuitem', { name:'Export options…', exact:true }).click();
  let next = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download scene SVG' }).click();
  const svg = (await readFile((await (await next).path())!)).toString(); expect(svg).toContain('C200,20 100,250 300,300');
  next = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download projection package' }).click();
  const zip = await next; await zip.saveAs(info.outputPath('export-tab.zip'));
  const files = unpackZip(await readFile((await zip.path())!)); expect(files['reference.png']).toBeUndefined();
  expect(JSON.parse(files['manifest.json'].toString()).durationS).toBe(15);
  await expect(page.getByRole('button', { name: 'Download projection package' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('projection-export-tab.png') });
});
