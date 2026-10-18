import { expect, test, type Page } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { normalizeVisuals, newVisual } from '../src/visual-document';
import { signIn, switchWorkspace, openOutput } from './helpers';

const tree = (page: Page) => page.getByRole('tree', { name: 'Clip index', exact: true });
const row = (page: Page, name: string) => tree(page).getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
async function command(page: Page, name: string, action: string) {
  await row(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function pixel(page: Page, selector: string) {
  const png = (await page.locator(selector).screenshot()).toString('base64');
  return page.evaluate(async encoded => {
    const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data].slice(0, 3);
  }, png);
}

test('asset menu and tree dragging control canvas/output stacking, undo, locks and saved order', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const show = normalizeVisuals(emptyShow()), scene = show.scenes[0];
  scene.artboard = { widthPx: 200, heightPx: 100 };
  const face = newSurface(show.output, 0); face.corners = [[30,20],[170,20],[170,80],[30,80]];
  scene.surfaces = [face];
  const red = newVisual(show, { mediaId: null, rect: [0,0,200,100], fill: '#ff0000' }, [{ sceneID: scene.id }]);
  const blue = newVisual(show, { mediaId: null, rect: [0,0,200,100], fill: '#0000ff' }, [{ sceneID: scene.id, surfaceID: face.id }]);
  red.name = 'Red scene'; blue.name = 'Blue face'; red.continuous = blue.continuous = true;
  show.visuals = [red, blue];
  const created = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: { app: 'map', scope: 'personal', name: 'Asset order.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64') } });
  expect(created.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await created.json()).id}`);
  await switchWorkspace(page, 'Visualization');
  const output = await openOutput(page);
  const order = async (names: string[], color: number[]) => {
    await expect(tree(page).locator('.aui-tree-label')).toHaveText(names);
    await expect.poll(() => pixel(page, '.map-output-preview')).toEqual(color);
    await expect.poll(() => pixel(output, '.map-output')).toEqual(color);
  };
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await command(page, 'Blue face', 'Hide asset');
  await order(['Blue face', 'Red scene'], [255,0,0]);
  await expect(output.locator('.map-fill')).toHaveCount(1);
  await command(page, 'Blue face', 'Show asset');
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await command(page, 'Blue face', 'Move backward');
  await order(['Red scene', 'Blue face'], [255,0,0]);
  await page.keyboard.press('ControlOrMeta+z');
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await command(page, 'Red scene', 'Move forward');
  await order(['Red scene', 'Blue face'], [255,0,0]);
  await row(page, 'Red scene').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Move forward', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  // Drop at row edges: top in the tree means last/front in the compositor.
  await row(page, 'Blue face').dragTo(row(page, 'Red scene'), { targetPosition: { x: 65, y: 2 } });
  await order(['Blue face', 'Red scene'], [0,0,255]);
  const bottom = (await row(page, 'Red scene').boundingBox())!.height - 2;
  await row(page, 'Blue face').dragTo(row(page, 'Red scene'), { targetPosition: { x: 65, y: bottom } });
  await order(['Red scene', 'Blue face'], [255,0,0]);
  await command(page, 'Blue face', 'Lock asset');
  await row(page, 'Blue face').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Move forward', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await row(page, 'Blue face').dragTo(row(page, 'Red scene'), { targetPosition: { x: 65, y: 2 } });
  await order(['Red scene', 'Blue face'], [255,0,0]);
  await command(page, 'Blue face', 'Unlock asset');
  await row(page, 'Blue face').click();
  const props = page.getByRole('region', { name: 'Selection properties' });
  await props.getByRole('tab', { name: 'Targets', exact: true }).click();
  await expect(props.getByRole('button', { name: 'Move backward', exact: true })).toBeDisabled();
  await props.getByRole('button', { name: 'Move forward', exact: true }).click();
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await command(page, 'Blue face', 'Duplicate asset');
  await expect(row(page, 'Blue face copy')).toBeVisible();
  await row(page, 'Blue face copy').click();
  await page.keyboard.press('F2');
  await tree(page).getByRole('textbox').fill('Blue copy renamed');
  await tree(page).getByRole('textbox').press('Enter');
  await expect(row(page, 'Blue copy renamed')).toBeVisible();
  await row(page, 'Blue copy renamed').click();
  await page.keyboard.press('Delete');
  await order(['Blue face', 'Red scene'], [0,0,255]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(row(page, 'Blue copy renamed')).toBeVisible();
  await output.close();
});
