import {test, expect} from '@playwright/test';
import {signIn} from './helpers';

test('Drive selection indicators stay quiet and double-click opens from an unselected row', async ({page, baseURL}, info) => {
  await signIn(page, baseURL!);
  const post = async (path: string, data: object) => {
    const response = await page.request.post(path, {headers: {Origin: baseURL!}, data});
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await post('/api/admin/apps', {id: 'drive', enabled: true});
  for (const name of ['Selection alpha.txt', 'Selection beta.txt']) {
    const file = await post('/api/drive/create', {name, app: 'drive', kind: 'file', data_base64: Buffer.from(name).toString('base64')});
    await post('/api/drive/open', {id: file.id});
  }
  await page.goto('/drive/');
  const table = page.getByRole('table', {name: 'Drive files'});
  for (const width of [1600, 600]) {
    await page.setViewportSize({width, height: 1000});
    for (const view of ['My files', 'Home']) {
      await page.getByRole('navigation', {name: 'Drive locations'}).getByRole('button', {name: view, exact: true}).click();
      const indicator = table.getByRole('checkbox', {name: 'Select Selection alpha.txt', exact: true});
      await expect(indicator).toHaveCSS('opacity', '0');
      const row = table.getByRole('row').filter({has: page.getByRole('checkbox', {name: 'Select Selection alpha.txt', exact: true})});
      await row.scrollIntoViewIfNeeded();
      const before = await row.boundingBox();
      await row.getByRole('button', {name: /^Selection alpha.txt/}).click();
      await expect(indicator).toBeChecked();
      await expect(indicator).toHaveCSS('opacity', '1');
      await expect(table.getByRole('checkbox', {name: 'Select Selection beta.txt', exact: true})).toHaveCSS('opacity', '0');
      expect((await row.boundingBox())!.y).toBe(before!.y);
      await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
      await expect(indicator).toHaveCSS('opacity', '0');
      await page.keyboard.press('Tab');
      await indicator.focus();
      await expect(indicator).toHaveCSS('opacity', '1');
      await indicator.press('Space');
      await expect(indicator).toBeChecked();
      await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
      for (const name of ['Selection alpha.txt', 'Selection beta.txt']) {
        await table.getByRole('button', {name: new RegExp(`^${name}`)}).dblclick();
        const preview = page.getByRole('dialog', {name, exact: true});
        await expect(preview).toBeVisible();
        await preview.getByRole('button', {name: 'Close', exact: true}).last().click();
        await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
      }
    }
  }
  await page.screenshot({path: info.outputPath('quiet-file-selection.png'), animations: 'disabled'});
});

test('App home double-click targets stay still when its command bar changes', async ({page, baseURL}) => {
  await signIn(page, baseURL!);
  const result = await page.request.post('/api/library/create', {headers: {Origin: baseURL!}, data: {app: 'cad', name: 'Double-click folder', kind: 'folder', scope: 'personal', parent: null}});
  expect(result.ok()).toBe(true);
  for (const width of [1600, 600]) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/cad/');
    await page.getByRole('button', {name: 'My files', exact: true}).click();
    await page.getByRole('textbox', {name: 'Filter by name or person'}).fill('Double-click folder');
    const name = page.getByRole('table', {name: 'Files', exact: true}).getByRole('button', {name: 'Double-click folder My files', exact: true});
    const before = await name.boundingBox();
    await name.click();
    expect((await name.boundingBox())!.y).toBe(before!.y);
    await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
    await name.dblclick();
    await expect(page.locator('.library-breadcrumb')).toContainText('Double-click folder');
  }
});
