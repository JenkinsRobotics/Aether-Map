import { expect, test } from '@playwright/test';
import { clickRibbon, command, documentCommand, signIn, solidPng } from './helpers';

test('shared vector gradients persist, keep mapping geometry and reach the linked output', async ({ page, baseURL }, info) => {
  const { switchWorkspace, openOutput, openPanel } = await import('./helpers');
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await switchWorkspace(page, 'Visualization'); await openPanel(page, 'Properties');
  await page.getByRole('combobox', { name: 'Surface content', exact: true }).selectOption('fill');
  const before = await page.locator('.map-surface > .map-fill').first().getAttribute('style');
  await page.getByRole('combobox', { name: 'Fill type', exact: true }).selectOption('linear');
  const angle = page.getByRole('textbox', { name: 'Gradient angle', exact: true }); await angle.fill('45'); await angle.press('Enter');
  const color = page.getByRole('textbox', { name: 'Stop 1 color', exact: true }); await color.fill('#ff3377'); await color.press('Enter');
  await page.getByRole('button', { name: 'Add gradient stop', exact: true }).click();
  const opacity = page.getByRole('textbox', { name: 'Stop 2 opacity', exact: true }); await opacity.fill('60'); await opacity.press('Enter');
  const paint = page.locator('.map-surface [data-vector-fill="linear"]').first(); await expect(paint).toBeVisible();
  expect(await paint.getAttribute('style')).toContain(before!.split(';').find(s => s.includes('matrix3d'))!.trim());
  const stops = await paint.locator('stop').evaluateAll(els => els.map(el => [el.getAttribute('offset'), el.getAttribute('stop-color'), el.getAttribute('stop-opacity')]));
  expect(stops).toHaveLength(3); expect(stops[1][2]).toBe('0.6');
  const output = await openOutput(page);
  await expect(output.locator('[data-vector-fill="linear"]')).toHaveCount(1);
  expect(await output.locator('stop').evaluateAll(els => els.map(el => [el.getAttribute('offset'), el.getAttribute('stop-color'), el.getAttribute('stop-opacity')]))).toEqual(stops);
  await output.screenshot({ path: info.outputPath('gradient-output.png') }); await output.close();
  await switchWorkspace(page, 'Mapping'); await expect(page.locator('.map-surface [data-vector-fill="linear"]')).toHaveCount(0);
  await switchWorkspace(page, 'Visualization'); await expect(paint).toBeVisible();
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload(); await switchWorkspace(page, 'Visualization'); await expect(paint).toBeVisible();
  await page.screenshot({ path: info.outputPath('gradient-visualization.png') });
});

const layerRow = (page: import('@playwright/test').Page, name: string) => page.getByRole('tree', { name: 'Layers', exact: true })
  .getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });

test('enabled backdrops and authored mapping appearance persist across scene switches and reload', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  for (const [name, color] of [['front.png', [38, 114, 153]], ['side.png', [154, 73, 38]]] as const) {
    if (name === 'side.png') {
      await (await command(page, 'Layer controls', 'New scene')).click();
      await page.getByRole('dialog', { name: 'New scene', exact: true }).getByRole('button', { name: 'Create', exact: true }).click();
    }
    const picker = page.waitForEvent('filechooser'); await clickRibbon(page, 'Import backdrop');
    await (await picker).setFiles({ name, mimeType: 'image/png', buffer: solidPng(640, 360, [...color]) });
    await clickRibbon(page, 'Cube');
  }
  await layerRow(page, 'Scene 2').click();
  const boards = page.locator('.map-artboard');
  const images = page.locator('.map-setup-background');
  await expect(images).toHaveCount(2);
  const originalImages = await images.elementHandles();
  const originalSurfaces = await page.locator('.map-surface').elementHandles();
  const snapshot = () => boards.evaluateAll(elements => elements.map(board => ({
    id: board.getAttribute('data-scene-id'),
    backdrop: board.querySelector('.map-setup-background')?.getAttribute('style'),
    surfaces: [...board.querySelectorAll('.map-surface')].map(s => s.getAttribute('style')),
    checkers: [...board.querySelectorAll('.map-surface-grid')].map(s => s.getAttribute('style')),
  })));
  const baseline = await snapshot();
  for (const scene of ['Scene 1', 'Scene 2', 'Scene 1', 'Scene 2']) {
    await layerRow(page, scene).click();
    expect(await snapshot()).toEqual(baseline);
    for (const image of originalImages) expect(await image.evaluate(el => el.isConnected)).toBe(true);
    for (const surface of originalSurfaces) expect(await surface.evaluate(el => el.isConnected)).toBe(true);
  }
  await page.getByRole('button', { name: 'X-ray', exact: true }).click();
  await expect(page.locator('.map-surface').first()).toHaveCSS('opacity', '0.2');
  await layerRow(page, 'Scene 1').click();
  for (const surface of await page.locator('.map-surface').all()) await expect(surface).toHaveCSS('opacity', '0.2');
  await page.getByRole('button', { name: 'X-ray', exact: true }).click();
  await page.screenshot({ path: info.outputPath('both-scenes-persistent.png') });
  await layerRow(page, 'Backdrop — side.png').getByRole('button', { name: 'Hide backdrop', exact: true }).click();
  await expect(images).toHaveCount(1);
  await layerRow(page, 'Scene 2').click(); await layerRow(page, 'Scene 1').click();
  await expect(images).toHaveCount(1);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await expect(images).toHaveCount(1);
  await layerRow(page, 'Scene 2').getByRole('button', { name: 'Expand Scene 2', exact: true }).click();
  await layerRow(page, 'Backdrop — side.png').getByRole('button', { name: 'Show backdrop', exact: true }).click();
  await expect(images).toHaveCount(2);
  expect(await snapshot()).toEqual(baseline);
});

test('mapping mask points insert on an edge, nudge, delete and undo without deleting the surface', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await page.getByRole('button', { name: 'Outline from quad', exact: true }).click();
  await page.getByRole('button', { name: 'Edit outline points', exact: true }).click();
  const handles = page.locator('.map-mask-handle');
  await expect(handles).toHaveCount(4);
  const first = (await handles.nth(0).boundingBox())!, second = (await handles.nth(1).boundingBox())!;
  await page.mouse.dblclick((first.x + first.width / 2 + second.x + second.width / 2) / 2, (first.y + first.height / 2 + second.y + second.height / 2) / 2);
  await expect(handles).toHaveCount(5);
  await handles.nth(1).click();
  const oldX = Number(await handles.nth(1).getAttribute('x'));
  await page.keyboard.press('Shift+ArrowRight');
  expect(Number(await handles.nth(1).getAttribute('x'))).toBeCloseTo(oldX + 10);
  await page.keyboard.press('Delete');
  await expect(handles).toHaveCount(4);
  await expect(page.locator('.map-surface')).toHaveCount(1);
  await documentCommand(page, 'Undo');
  await expect(handles).toHaveCount(5);
  await page.screenshot({ path: info.outputPath('mask-node-editing.png') });
});

test('black masks stay black in Mapping while visual source tools remain in Visualization', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'Mask');
  await expect(page.locator('.map-fill')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('.map-surface')).toHaveAttribute('data-preview', 'mapping');
  await expect(page.getByRole('region', { name: 'Map tools' }).getByRole('button', { name: 'Shader', exact: true })).toHaveCount(0);
});

test('selected mask corners round, undo, persist and use the same clipping on the output', async ({ page, baseURL }, info) => {
  const { openOutput, switchWorkspace } = await import('./helpers');
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await page.getByRole('button', { name: 'Outline from quad', exact: true }).click();
  await page.getByRole('button', { name: 'Edit outline points', exact: true }).click();
  const points = page.locator('.map-mask-handle'), surface = page.locator('.map-surface');
  await points.first().click();
  const amount = page.getByRole('textbox', { name: 'Round amount', exact: true });
  await amount.fill('80'); await amount.press('Enter');
  const original = await surface.evaluate(el => (el as HTMLElement).style.clipPath);
  await page.getByRole('button', { name: 'Round selected point', exact: true }).click();
  await expect.poll(() => points.count()).toBeGreaterThan(4);
  const rounded = await surface.evaluate(el => (el as HTMLElement).style.clipPath);
  expect(rounded).not.toBe(original);
  await page.screenshot({ path: info.outputPath('rounded-mask-corner.png') });
  await documentCommand(page, 'Undo'); await expect(points).toHaveCount(4);
  expect(await surface.evaluate(el => (el as HTMLElement).style.clipPath)).toBe(original);
  await documentCommand(page, 'Redo');
  expect(await surface.evaluate(el => (el as HTMLElement).style.clipPath)).toBe(rounded);
  const output = await openOutput(page);
  await expect.poll(() => output.locator('.map-surface').evaluate(el => (el as HTMLElement).style.clipPath)).toBe(rounded);
  await output.close(); await switchWorkspace(page, 'Mapping');
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await expect.poll(() => surface.evaluate(el => (el as HTMLElement).style.clipPath)).toBe(rounded);
});

test('whole compound reflections preserve faces and undo as one operation', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'Cube');
  const outlines = page.locator('.map-outline');
  const snapshot = () => outlines.evaluateAll(items => items.map(el => el.getAttribute('points')));
  const before = await snapshot(); expect(before).toHaveLength(3);
  await expect(page.getByText('Nothing selected', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
  expect(await snapshot()).not.toEqual(before);
  await page.getByRole('button', { name: 'Flip horizontal', exact: true }).click();
  expect(await snapshot()).toEqual(before);
  await page.getByRole('button', { name: 'Flip vertical', exact: true }).click();
  expect(await snapshot()).not.toEqual(before);
  await documentCommand(page, 'Undo'); expect(await snapshot()).toEqual(before);
  await expect(page.locator('.map-surface')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('compound-reflection.png') });
});

test('mapping precision controls persist, resize node pins and keep document geometry unchanged', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await clickRibbon(page, 'Node');
  const before = await page.locator('.map-outline').getAttribute('points');
  await page.getByText('Mapping precision', { exact: true }).click();
  const distance = page.getByRole('textbox', { name: 'Snap distance', exact: true });
  await distance.fill('18'); await distance.press('Enter');
  const pins = page.getByRole('textbox', { name: 'Mapping pin size', exact: true });
  const oldRadius = Number(await page.locator('.map-handle').first().getAttribute('r'));
  await pins.fill('14'); await pins.press('Enter');
  expect(Number(await page.locator('.map-handle').first().getAttribute('r'))).toBeCloseTo(oldRadius * 2);
  await page.getByRole('checkbox', { name: 'Mapping canvas grid', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Mapping snapping', exact: true }).uncheck();
  await expect(page.locator('.map-canvas-host')).toHaveCSS('background-image', 'none');
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.map-outline').getAttribute('points')).toBe(before);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await page.getByText('Mapping precision', { exact: true }).click();
  await expect(distance).toHaveValue('18'); await expect(pins).toHaveValue('14');
  await expect(page.locator('.map-canvas-host')).toHaveCSS('background-image', 'none');
  await expect(page.getByRole('checkbox', { name: 'Mapping snapping', exact: true })).not.toBeChecked();
});

test('retained curve handles reshape a mask, split without flattening, undo and persist', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await page.getByRole('button', { name: 'Outline from quad', exact: true }).click();
  await page.getByRole('button', { name: 'Edit outline points', exact: true }).click();
  await page.locator('.map-mask-handle').first().click();
  await page.getByRole('button', { name: 'Curve outgoing edge', exact: true }).click();
  const controls = page.locator('.map-curve-control'); await expect(controls).toHaveCount(2);
  const surface = page.locator('.map-surface'), before = await surface.getAttribute('style');
  const p = (await controls.first().boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2); await page.mouse.down();
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2 + 65, { steps: 5 }); await page.mouse.up();
  const curved = await surface.getAttribute('style'); expect(curved).not.toBe(before);
  await page.keyboard.press('ArrowRight');
  await expect(controls).toHaveCount(2);
  await documentCommand(page, 'Undo');
  expect(await surface.getAttribute('style')).toBe(curved);
  await page.screenshot({ path: info.outputPath('retained-bezier-handles.png') });
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  expect(await surface.getAttribute('style')).toBe(curved);
  await layerRow(page, 'Surface 1').click(); await clickRibbon(page, 'Node'); await expect(controls).toHaveCount(2);
});

test('Visualization applies and replaces media on surfaces and scene canvas with stable inactive previews', async ({ page, baseURL }, info) => {
  const { switchWorkspace, openShowMedia, openOutput, openPanel } = await import('./helpers');
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await switchWorkspace(page, 'Visualization');
  await openPanel(page, 'Assets'); await openShowMedia(page);
  for (const [name, color] of [['blue.png', [12, 90, 190]], ['orange.png', [230, 100, 30]]] as const) {
    const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await (await picker).setFiles({ name, mimeType: 'image/png', buffer: solidPng(640, 360, [...color]) });
    await expect(page.locator('.map-media-item').filter({ hasText: name })).toBeVisible();
  }
  const blue = page.locator('.map-media-item').filter({ hasText: 'blue.png' }).getByRole('button', { name: 'Apply', exact: true });
  const orange = page.locator('.map-media-item').filter({ hasText: 'orange.png' }).getByRole('button', { name: 'Apply', exact: true });
  await blue.click(); await expect(page.locator('.map-surface img')).toHaveCount(1);
  const original = await page.locator('.map-surface img').getAttribute('src');
  await orange.click(); await expect(page.locator('.map-surface img')).toHaveCount(1);
  expect(await page.locator('.map-surface img').getAttribute('src')).not.toBe(original);
  await page.getByRole('combobox', { name: 'Content target', exact: true }).selectOption('scene'); await blue.click();
  await expect(page.locator('.map-surface img')).toHaveCount(2);
  const sources = await page.locator('.map-surface img').evaluateAll(els => els.map(e => e.getAttribute('src')));
  const output = await openOutput(page); await expect(output.locator('.map-surface img')).toHaveCount(2); await output.close();
  await (await command(page, 'Layer controls', 'New scene')).click();
  await page.getByRole('dialog', { name: 'New scene', exact: true }).getByRole('button', { name: 'Create', exact: true }).click();
  expect(await page.locator('.map-surface img').evaluateAll(els => els.map(e => e.getAttribute('src')))).toEqual(sources);
  await page.screenshot({ path: info.outputPath('scene-and-surface-media.png') });
  await switchWorkspace(page, 'Mapping'); await expect(page.locator('.map-surface img')).toHaveCount(0);
  await expect(page.locator('.map-surface')).toHaveCount(1); // scene visual is not a mapping surface
  await switchWorkspace(page, 'Visualization');
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload(); await switchWorkspace(page, 'Visualization');
  await expect(page.locator('.map-surface img')).toHaveCount(2);
});

test('text silhouettes clip Mapping and output identically and persist independently of the visual source', async ({ page, baseURL }, info) => {
  const { openOutput } = await import('./helpers');
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await clickRibbon(page, 'New Surface');
  await page.getByText('Text and image silhouette', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Mask text', exact: true }).fill('AOB');
  await page.getByRole('button', { name: 'Use text silhouette', exact: true }).click();
  const mask = page.locator('.map-surface-grid');
  await expect.poll(() => mask.evaluate(el => (el as HTMLElement).style.maskImage)).toContain('data:image/png;base64,');
  const png = await mask.evaluate(el => (el as HTMLElement).style.maskImage);
  await page.screenshot({ path: info.outputPath('text-silhouette.png') });
  const output = await openOutput(page);
  await expect.poll(() => output.locator('.map-surface-grid').evaluate(el => (el as HTMLElement).style.maskImage)).toBe(png);
  await output.close(); await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await expect.poll(() => mask.evaluate(el => (el as HTMLElement).style.maskImage)).toBe(png);
});

test('snapped corners remain welded through nudges, undo, reload and explicit detach', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await clickRibbon(page, 'New Surface'); await clickRibbon(page, 'Node');
  const target = await page.locator('.map-outline').first().evaluate(el => {
    const poly = el as SVGPolygonElement, p = poly.points.getItem(1), pt = new DOMPoint(p.x, p.y).matrixTransform(poly.getScreenCTM()!);
    return { x: pt.x, y: pt.y };
  });
  const pin = page.locator('.map-handle').first(), bounds = (await pin.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Break corner weld', exact: true })).toBeVisible();
  const points = () => page.locator('.map-outline').evaluateAll(els => els.map(el => [...(el as SVGPolygonElement).points].map(p => [p.x, p.y])));
  const before = await points(); expect(before[0][1]).toEqual(before[1][0]);
  await page.keyboard.press('Shift+ArrowDown');
  const after = await points(); expect(after[0][1]).toEqual(after[1][0]); expect(after[0][1][1]).toBeCloseTo(before[0][1][1] + 10);
  await documentCommand(page, 'Undo'); expect(await points()).toEqual(before);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await layerRow(page, 'Surface 2').click(); await clickRibbon(page, 'Node'); await page.locator('.map-handle').first().click();
  await page.getByRole('button', { name: 'Break corner weld', exact: true }).click();
  await page.locator('.map-handle').first().click(); await page.keyboard.press('Shift+ArrowDown');
  expect((await points())[0][1]).not.toEqual((await points())[1][0]);
});

test('cylindrical content bending is visible in Mapping, shared with output, and reversible', async ({ page, baseURL }, info) => {
  const { openOutput } = await import('./helpers');
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await clickRibbon(page, 'New Surface');
  await page.getByText('Curved projection', { exact: true }).click();
  const angle = page.getByRole('textbox', { name: 'Bend angle', exact: true }); await angle.fill('140'); await angle.press('Enter');
  await expect(page.locator('.map-bent-content')).toHaveAttribute('data-bend', '140');
  const map = await page.locator('feImage').getAttribute('href'); expect(map).toContain('data:image/png;base64,');
  await page.screenshot({ path: info.outputPath('cylindrical-projection.png') });
  await documentCommand(page, 'Undo'); await expect(page.locator('.map-bent-content')).toHaveCount(0);
  await documentCommand(page, 'Redo');
  const output = await openOutput(page); await expect(output.locator('.map-bent-content')).toHaveAttribute('data-bend', '140');
  expect(await output.locator('feImage').getAttribute('href')).toBe(map);
  await output.close();
});

test('pen drag creates editable Bezier handles instead of baked samples, and saves them', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await clickRibbon(page, 'Pen');
  const board = (await page.locator('.map-artboard').boundingBox())!;
  const x = board.x + board.width * .25, y = board.y + board.height * .35;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 75, y - 40, { steps: 4 }); await page.mouse.up();
  await page.mouse.move(x + 280, y + 120); await page.mouse.down(); await page.mouse.move(x + 310, y + 190, { steps: 4 }); await page.mouse.up();
  await page.mouse.click(x + 10, y + 210); await page.mouse.click(x, y);
  await expect(page.locator('.map-surface')).toHaveCount(1);
  await expect(page.locator('.map-mask-handle')).toHaveCount(3);
  await expect(page.locator('.map-curve-control')).toHaveCount(6);
  await page.locator('.map-mask-handle').first().click();
  await expect(page.getByRole('combobox', { name: 'Node type', exact: true })).toHaveValue('symmetric');
  const handle = page.locator('.map-curve-control').first(), before = await page.locator('.map-mask-outline').getAttribute('points');
  await handle.click(); await page.keyboard.press('Shift+ArrowDown');
  expect(await page.locator('.map-mask-outline').getAttribute('points')).not.toBe(before);
  await documentCommand(page, 'Undo'); expect(await page.locator('.map-mask-outline').getAttribute('points')).toBe(before);
  await page.screenshot({ path: info.outputPath('pen-bezier-authoring.png') });
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await layerRow(page, 'Surface 1').click(); await clickRibbon(page, 'Node');
  await expect(page.locator('.map-curve-control')).toHaveCount(6);
});

test('automatic image subject extraction runs locally and stores a usable portable alpha mask', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await clickRibbon(page, 'New Surface');
  await page.getByText('Text and image silhouette', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Automatically detect image subject', exact: true }).check();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import image silhouette', exact: true }).click();
  await (await chooser).setFiles({ name: 'subject.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/><ellipse cx="160" cy="175" rx="70" ry="90" fill="#e37b15"/><circle cx="160" cy="95" r="45" fill="#e37b15"/><circle cx="145" cy="86" r="7"/><circle cx="175" cy="86" r="7"/><path d="M150 108 Q160 118 170 108" fill="none" stroke="black" stroke-width="5"/></svg>') });
  const grid = page.locator('.map-surface-grid');
  await expect.poll(async () => { const alert = page.getByRole('alert'); if (await alert.count()) throw new Error(await alert.innerText()); return grid.evaluate(el => (el as HTMLElement).style.maskImage); }, { timeout: 90000 }).toContain('data:image/png;base64,');
  const alpha = await grid.evaluate(async el => {
    const url = (el as HTMLElement).style.maskImage.slice(5, -2), image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { center: ctx.getImageData(160, 170, 1, 1).data[3], corner: ctx.getImageData(5, 5, 1, 1).data[3] };
  });
  expect(alpha.center).toBeGreaterThan(200); expect(alpha.corner).toBeLessThan(50);
  await page.screenshot({ path: info.outputPath('automatic-subject-mask.png') });
});

test('shared symmetric node mode couples mask handles and persists', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface');
  await page.getByRole('button', { name: 'Outline from quad', exact: true }).click();
  await page.getByRole('button', { name: 'Edit outline points', exact: true }).click();
  await page.locator('.map-mask-handle').first().click();
  await page.getByRole('combobox', { name: 'Node type', exact: true }).selectOption('symmetric');
  const handles = page.locator('.map-curve-control'); await expect(handles).toHaveCount(4);
  const opposite = await handles.last().boundingBox(), handle = (await handles.first().boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2 + 24, { steps: 5 }); await page.mouse.up();
  expect(await handles.last().boundingBox()).not.toEqual(opposite);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await layerRow(page, 'Surface 1').click(); await clickRibbon(page, 'Node');
  await page.locator('.map-mask-handle').first().click();
  await expect(page.getByRole('combobox', { name: 'Node type', exact: true })).toHaveValue('symmetric');
});


test('shared cubic ellipse surfaces preserve nodes, reverse and independent handles', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await clickRibbon(page, 'Ellipse');
  const board = (await page.locator('.map-artboard').boundingBox())!;
  const a = { x: board.x + board.width * .25, y: board.y + board.height * .2 };
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 300, a.y + 180, { steps: 5 }); await page.mouse.up();
  const anchors = page.locator('.map-mask-handle'), handles = page.locator('.map-curve-control');
  await expect(anchors).toHaveCount(4); await expect(handles).toHaveCount(8);
  await anchors.first().click();
  const modes = page.getByRole('combobox', { name: 'Node type', exact: true }); await expect(modes).toHaveValue('smooth');
  const outline = page.locator('.map-mask-outline'), original = await outline.getAttribute('points');
  await page.getByRole('button', { name: 'Reverse outline', exact: true }).click();
  expect(await outline.getAttribute('points')).not.toBe(original);
  await documentCommand(page, 'Undo'); expect(await outline.getAttribute('points')).toBe(original);
  const opposite = await handles.last().boundingBox(), h = (await handles.first().boundingBox())!;
  await page.keyboard.down('Alt'); await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 30, h.y + h.height / 2 + 20, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Alt');
  expect(await handles.last().boundingBox()).toEqual(opposite);
  await anchors.first().click(); await expect(modes).toHaveValue('corner');
  const edited = await outline.getAttribute('points');
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await layerRow(page, 'Surface 1').click(); await clickRibbon(page, 'Node');
  await expect(anchors).toHaveCount(4); await expect(handles).toHaveCount(8);
  expect(await outline.getAttribute('points')).toBe(edited);
  await anchors.first().click(); await expect(modes).toHaveValue('corner');
  await page.screenshot({ path: info.outputPath('shared-vector-surface.png') });
});
