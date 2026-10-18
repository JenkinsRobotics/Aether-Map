import { expect, test, type Page } from '@playwright/test';
import { clickRibbon, command as control, documentCommand, signIn } from './helpers';

const tree = (page: Page) => page.getByRole('tree', { name: 'Layers', exact: true });
const row = (page: Page, name: string) => tree(page).getByRole('treeitem').filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
const labels = (page: Page) => tree(page).locator('.aui-tree-label');
async function addScene(page: Page) {
  await (await control(page, 'Layer controls', 'New scene')).click();
  await page.getByRole('dialog', { name: 'New scene', exact: true }).getByRole('button', { name: 'Create', exact: true }).click();
}
async function context(page: Page, name: string, command: string) {
  await row(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: new RegExp(`^${command}(?:\\s|$)`) }).click();
}

test('scene visibility, drag ordering, rename and delete use the shared tree controls', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await addScene(page);
  await row(page, 'Scene 1').getByRole('button', { name: 'Hide Scene 1 on the canvas', exact: true }).click();
  await expect(page.locator('.map-artboard')).toHaveCount(1);
  await row(page, 'Scene 1').getByRole('button', { name: 'Show Scene 1 on the canvas', exact: true }).click();
  await expect(page.locator('.map-artboard')).toHaveCount(2);
  await row(page, 'Scene 2').dragTo(row(page, 'Scene 1'), { targetPosition: { x: 75, y: 2 } });
  await expect(labels(page)).toHaveText(['Scene 2', 'Scene 1']);
  await context(page, 'Scene 2', 'Move scene down');
  await expect(labels(page)).toHaveText(['Scene 1', 'Scene 2']);
  await row(page, 'Scene 2').click(); await row(page, 'Scene 2').press('F2');
  await tree(page).getByRole('textbox').fill('Side wall'); await tree(page).getByRole('textbox').press('Enter');
  await expect(labels(page)).toHaveText(['Scene 1', 'Side wall']);
  await row(page, 'Side wall').click(); await row(page, 'Side wall').press('Delete');
  await expect(labels(page)).toHaveText(['Scene 1']);
  await documentCommand(page, 'Undo');
  await expect(labels(page)).toHaveText(['Scene 1', 'Side wall']);
  await page.screenshot({ path: info.outputPath('scene-controls.png') });
});

test('empty folders persist, accept dragged surfaces, and ungroup keeps the geometry', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await (await control(page, 'Layer controls', 'New folder')).click();
  await tree(page).getByRole('textbox').fill('Scenery'); await tree(page).getByRole('textbox').press('Enter');
  await expect(row(page, 'Scenery')).toBeVisible();
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await expect(row(page, 'Scenery')).toBeVisible();
  await clickRibbon(page, 'New Surface');
  await row(page, 'Surface 1').dragTo(row(page, 'Scenery'));
  await expect(row(page, 'Surface 1')).toHaveAttribute('aria-level', '3');
  await row(page, 'Scenery').getByRole('button', { name: 'Hide Scenery', exact: true }).click();
  await expect(page.locator('.map-surface')).toHaveCount(0);
  await row(page, 'Scenery').getByRole('button', { name: 'Show Scenery', exact: true }).click();
  await expect(page.locator('.map-surface')).toHaveCount(1);
  await addScene(page);
  await context(page, 'Scenery', 'Move to Scene 2');
  await expect(labels(page)).toHaveText(['Scene 1', 'Scene 2', 'Scenery', 'Surface 1']);
  await expect(page.locator('.map-artboard.is-active .map-surface')).toHaveCount(1);
  await context(page, 'Scenery', 'Ungroup');
  await expect(row(page, 'Scenery')).toHaveCount(0);
  await expect(row(page, 'Surface 1')).toHaveAttribute('aria-level', '2');
  await documentCommand(page, 'Undo');
  await expect(row(page, 'Scenery')).toBeVisible();
  await page.screenshot({ path: info.outputPath('folder-controls.png') });
  await context(page, 'Scenery', 'Delete group and contents');
  await expect(row(page, 'Surface 1')).toHaveCount(0);
  await expect(page.locator('.map-artboard')).toHaveCount(2);
});

test('multiple layers group in one edit, then whole groups drag between scenes', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await clickRibbon(page, 'New Surface');
  await row(page, 'Surface 1').click(); await row(page, 'Surface 2').click({ modifiers: ['ControlOrMeta'] });
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveCount(2);
  await (await control(page, 'Layer controls', 'Group selected layers')).click();
  await tree(page).getByRole('textbox').fill('Pair'); await tree(page).getByRole('textbox').press('Enter');
  await expect(row(page, 'Surface 1')).toHaveAttribute('aria-level', '3');
  await expect(row(page, 'Surface 2')).toHaveAttribute('aria-level', '3');
  await addScene(page);
  await row(page, 'Pair').dragTo(row(page, 'Scene 2'));
  await expect(labels(page)).toHaveText(['Scene 1', 'Scene 2', 'Pair', 'Surface 2', 'Surface 1']);
  await expect(row(page, 'Pair')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.map-artboard.is-active .map-surface')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('group-transfer.png') });
  await documentCommand(page, 'Undo');
  await expect(labels(page)).toHaveText(['Scene 1', 'Pair', 'Surface 2', 'Surface 1', 'Scene 2']);
  await documentCommand(page, 'Redo');
  await expect(labels(page)).toHaveText(['Scene 1', 'Scene 2', 'Pair', 'Surface 2', 'Surface 1']);
});

test('tree multi-selection hides and deletes together, with one undo, including ribbon Delete', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'New Surface'); await clickRibbon(page, 'New Surface');
  const selectBoth = async () => { await row(page, 'Surface 1').click(); await row(page, 'Surface 2').click({ modifiers: ['ControlOrMeta'] }); };
  await selectBoth();
  await (await control(page, 'Layer controls', 'Hide layer')).click();
  await expect(page.locator('.map-surface')).toHaveCount(0);
  await (await control(page, 'Layer controls', 'Show layer')).click();
  await expect(page.locator('.map-surface')).toHaveCount(2);
  await row(page, 'Surface 2').press('Delete');
  await expect(page.locator('.map-surface')).toHaveCount(0);
  await documentCommand(page, 'Undo');
  await expect(page.locator('.map-surface')).toHaveCount(2);
  await selectBoth();
  await clickRibbon(page, 'Delete');
  await expect(page.locator('.map-surface')).toHaveCount(0);
  await expect(labels(page)).toHaveText(['Scene 1']);
  await documentCommand(page, 'Undo');
  await expect(page.locator('.map-surface')).toHaveCount(2);
});
