import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn, switchWorkspace } from './helpers';

async function blankMenu(page: Page, area: Locator) {
  const box = await area.boundingBox();
  expect(box).not.toBeNull();
  await area.click({ button: 'right', position: { x: 16, y: box!.height - 8 } });
  await expect(page.getByRole('menuitem', { name: /^(Undo|Redo)$|Aether Map settings/ })).toHaveCount(0);
}

test('mapping panel backgrounds and rows use their own commands', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page, 'Mapping');
  const layers = page.getByRole('tree', { name: 'Layers', exact: true }).locator('..');
  await blankMenu(page, layers);
  for (const name of ['New Surface', 'New canvas', 'New folder', 'Add a ready-made canvas', 'Show in tree']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(1);
  }
  const backgroundLabels = await page.locator('[role="menu"] .aui-menu-label').allTextContents();
  await page.keyboard.press('Escape');
  const panel = layers.locator('..');
  await panel.getByRole('button', { name: 'Layers options', exact: true }).click();
  expect(await page.locator('[role="menu"] .aui-menu-label').allTextContents()).toEqual(backgroundLabels);
  expect(Math.round((await panel.locator('.aui-collection-heading').boundingBox())!.height)).toBe(45);
  expect(Math.round((await panel.locator('.aui-collection-footer').boundingBox())!.height)).toBe(54);
  await page.screenshot({ path: info.outputPath('layers-background.png') });
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const rename = page.getByRole('textbox', { name: /^Rename Folder/ });
  await rename.fill('Mapping group');
  await rename.press('Enter');
  const row = page.getByRole('treeitem', { name: /Mapping group/ });
  await row.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Rename/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Undo|Redo|Aether Map settings/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await blankMenu(page, layers);
  await page.getByRole('menuitem', { name: 'New canvas', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New canvas', exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'New canvas' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  const outputs = page.getByRole('tree', { name: 'Outputs', exact: true }).locator('..');
  await blankMenu(page, outputs);
  for (const name of ['New output', 'Devices', 'Record the output to a file']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('menuitem', { name: 'Devices', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('visuals keep view and creation actions on both cards and tree backgrounds', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page, 'Content');
  await blankMenu(page, page.getByRole('list', { name: 'Clip visuals', exact: true }));
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'List', exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Clip visuals', exact: true });
  await blankMenu(page, tree.locator('..'));
  await expect(page.getByRole('menuitem', { name: 'Add layer', exact: true })).toHaveCount(1);
  await expect(page.getByRole('menuitem', { name: 'View', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('visuals-background.png') });
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Cards', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Clip visuals', exact: true })).toBeVisible();
  await page.getByRole('toolbar', { name: 'Aux toolbar' }).getByRole('button', { name: 'Files', exact: true }).click();
  // Files › This show is the document's Media pool, with its creation and view commands.
  const files = page.getByRole('region', { name: 'Files navigation' }).getByRole('region', { name: 'Media pool' });
  await blankMenu(page, files.getByRole('list', { name: 'Media pool items' }));
  await expect(page.getByRole('menuitem', { name: 'New scene', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Thumbnails', exact: true }).click();
  await expect(files).toHaveAttribute('data-view', 'gallery');
  // Native editing menus must remain native even inside a context-enabled panel.
  const search = page.getByRole('searchbox', { name: 'Search Clip visuals' });
  // Card mode has no search field; switch back through the same view command.
  await page.getByRole('toolbar', { name: 'Aux toolbar' }).getByRole('button', { name: 'Files', exact: true }).click();
  await blankMenu(page, page.getByRole('list', { name: 'Clip visuals', exact: true }));
  await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'List', exact: true }).click();
  expect(await search.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
  await expect(page.getByRole('menu')).toHaveCount(0);
});
