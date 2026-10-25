import { expect, test } from '@playwright/test';
import { signIn, switchWorkspace } from './helpers';

// App-wide fallback menus are intentionally gone. The canvas still provides
// its own zoom commands through a scoped shared registration.
test('canvas zoom stays scoped; chrome and native fields have no generic app menu', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page, 'Mapping');
  const canvas = page.locator('.map-canvas-host[aria-label="Mapping canvas"]');
  const before = await canvas.locator('.map-zoom-value').innerText();
  await canvas.click({ button: 'right', position: { x: 400, y: 300 } });
  const menu = page.getByRole('menu', { name: 'Aether commands' });
  await expect(menu.getByRole('menuitem', { name: /Undo|Redo|settings/ })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Zoom in', exact: true }).click();
  await expect(canvas.locator('.map-zoom-value')).not.toHaveText(before);
  const search = page.getByRole('searchbox', { name: 'Search Layers', exact: true });
  await search.fill('Surface');
  expect(await search.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
  await expect(page.getByRole('menu')).toHaveCount(0);
  const header = page.locator('.aui-document-bar').first();
  await header.dispatchEvent('contextmenu', { clientX: 450, clientY: 30 });
  await expect(page.getByRole('menu')).toHaveCount(0);
});


test('clip menus retain copy and paste without an unrelated command footer', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page, 'Content');
  await page.getByRole('region', { name: 'Map tools' }).getByRole('group', { name: 'Add' }).getByRole('button', { name: 'Colour', exact: true }).click();
  const dock = page.getByRole('toolbar', { name: 'View tools' }).getByRole('button', { name: 'Timeline', exact: true });
  if (await dock.getAttribute('aria-pressed') !== 'true') await dock.click();
  const timeline = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  await timeline.locator('.map-clip').first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Timeline actions' });
  await expect(menu.getByRole('menuitem', { name: /Undo|Redo|settings/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('clip-context-menu.png') });
  await menu.getByRole('menuitem', { name: 'Copy clip', exact: true }).click();
  await page.getByRole('combobox', { name: 'Timeline mode' }).selectOption('advanced');
  await timeline.getByLabel('V1 clips').click({ button: 'right', position: { x: 450, y: 60 } });
  await page.getByRole('menuitem', { name: 'Paste at playhead', exact: true }).click();
  await expect(timeline.locator('.map-clip')).toHaveCount(2);
});
