import {expect, test} from '@playwright/test';
import {signIn} from './helpers';

for (const app of ['cad', 'map', 'animation']) {
  test(`${app} folder navigation clears filters and grid supports keyboard opening`, async ({page, baseURL}) => {
    await signIn(page, baseURL!);
    const create = async (name: string, parent: string | null = null) => {
      const result = await page.request.post('/api/library/create', {
        headers: {Origin: baseURL!}, data: {app, name, parent, kind: 'folder', scope: 'personal'},
      });
      expect(result.ok()).toBe(true);
      return result.json();
    };
    const folder = await create(`Navigation parent ${app}`);
    await create('Child folder', folder.id);
    await page.goto(`/${app}/`);
    await page.getByRole('textbox', {name: /^Search Aether .* files$/}).fill(`Navigation parent ${app}`);
    const filter = page.getByRole('textbox', {name: 'Filter by name or person'});
    await filter.fill(`Navigation parent ${app}`);
    await page.getByRole('table', {name: 'Files', exact: true}).getByRole('button', {name: new RegExp(`^Navigation parent ${app}`)}).dblclick();
    await expect(filter).toHaveValue('');
    await expect(page.getByRole('textbox', {name: /^Search Aether .* files$/})).toHaveValue('');
    await expect(page.getByRole('heading', {name: 'My files', exact: true})).toBeVisible();
    await expect(page.getByRole('table', {name: 'Files', exact: true})).toContainText('Child folder');
    await filter.fill('No such child');
    await expect(page.getByRole('heading', {name: 'No matching files'})).toBeVisible();
    await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
    await page.getByRole('button', {name: 'File view', exact: true}).click();
    await page.getByRole('menuitemradio', {name: 'Grid view', exact: true}).click();
    await page.locator('.library-grid').getByRole('button', {name: /^Child folder/}).press('Enter');
    await expect(page.locator('.library-breadcrumb')).toContainText('Child folder');
    await page.locator('.library-breadcrumb').getByRole('button', {name: `Navigation parent ${app}`, exact: true}).click();
    await expect(page.locator('.library-grid')).toContainText('Child folder');
    await page.locator('.library-grid').getByRole('button', {name: /^Child folder/}).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Details', exact: true}).click();
    await expect(page.locator('.library-details')).toContainText('Child folder');
  });

  test(`${app} failed folder requests show retry instead of stale or empty files`, async ({page, baseURL}, info) => {
    await signIn(page, baseURL!);
    const result = await page.request.post('/api/library/create', {
      headers: {Origin: baseURL!}, data: {app, name: `Retry directory ${app}`, kind: 'folder', scope: 'personal'},
    });
    const folder = await result.json();
    await page.goto(`/${app}/`);
    await page.getByRole('button', {name: 'My files', exact: true}).click();
    await expect(page.getByRole('table', {name: 'Files', exact: true})).toContainText(`Retry directory ${app}`);
    let fail!: () => void;
    const pending = new Promise<void>(resolve => { fail = resolve; });
    await page.route('**/api/library/list', async route => {
      if (route.request().postDataJSON().parent !== folder.id) return route.continue();
      await pending;
      await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Temporary library failure'})});
    }, {times: 1});
    await page.getByRole('table', {name: 'Files', exact: true}).getByRole('button', {name: new RegExp(`^Retry directory ${app}`)}).dblclick();
    await expect(page.getByRole('status').filter({hasText: 'Loading files'})).toBeVisible();
    await expect(page.getByRole('table', {name: 'Files', exact: true})).toHaveCount(0);
    await expect(page.getByRole('heading', {name: 'This folder is ready for your work'})).toHaveCount(0);
    fail();
    await expect(page.getByRole('alert')).toContainText('Temporary library failure');
    await page.screenshot({path: info.outputPath(`${app}-listing-retry.png`)});
    await page.getByRole('button', {name: 'Retry', exact: true}).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', {name: 'This folder is ready for your work'})).toBeVisible();
  });
}

test('a late directory response cannot replace a newer library location', async ({page, baseURL}) => {
  await signIn(page, baseURL!);
  await page.goto('/cad/');
  await expect(page.locator('.library-listing-main')).toHaveAttribute('aria-busy', 'false');
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/library/list', async route => {
    if (route.request().postDataJSON().view !== 'personal') return route.continue();
    await pending;
    await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Stale directory failure'})});
  }, {times: 1});
  await page.getByRole('button', {name: 'My files', exact: true}).click();
  await expect(page.locator('.library-listing-main')).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', {name: 'Home', exact: true}).click();
  await expect(page.locator('.library-listing-main')).toHaveAttribute('aria-busy', 'false');
  const completed = page.waitForResponse(response => response.url().endsWith('/api/library/list') && response.status() === 503);
  finish(); await completed;
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Recently opened', exact: true})).toBeVisible();
});
