import { expect, test, type Page } from '@playwright/test';
import { clickRibbon, saveShow, signIn } from './helpers';
// Scenes are the roots of the one content tree, so a layer is a level-2 row.
const layers = (page: Page) => page.getByRole('tree', { name: 'Layers', exact: true }).locator('[role=treeitem][aria-level="2"]');
async function add(page: Page) { await clickRibbon(page, 'New Surface'); }
async function saved(page: Page) { await expect(page.getByRole('tablist', {name:'Open shows'}).getByRole('tab', { selected: true }).getByRole('status')).toHaveText('Saved'); await expect(page).toHaveURL(/document=/); }

async function recoverCopy(page: Page, name: string) {
  await page.locator('.map-file-tabs').getByRole('button', {name:'Save a copy', exact:true}).click();
  const dialog = page.getByRole('dialog', { name:'Save show', exact:true });
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', {name:'Save',exact:true}).click();
}

async function stored(page: Page, baseURL: string, id = new URL(page.url()).searchParams.get('document')!) {
  const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL }, data: { app: 'map', id } });
  expect(response.ok()).toBe(true); const file = await response.json();
  return { ...file, show: JSON.parse(Buffer.from(file.data_base64, 'base64').toString()) };
}

test('interrupted new shows retain their edits and can be recovered explicitly', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show');
  // Hold creation so the response is uncertain at refresh; never silently create twice.
  await page.route('**/api/library/create', route => route.abort());
  await add(page); await page.reload(); await expect(layers(page)).toHaveCount(1);
  await page.unroute('**/api/library/create');
  await recoverCopy(page, 'Recovered draft'); await saved(page);
  await add(page); await saved(page);
  expect((await stored(page, baseURL!)).show.scenes[0].surfaces).toHaveLength(2);
  const name = 'DEMO – Front elevation projection setup';
  await saveShow(page, name); await saved(page);
  const title = page.getByRole('tablist', {name:'Open shows'}).getByRole('tab', { selected: true });
  await expect(title).toContainText(name);
  expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.reload(); await expect(layers(page)).toHaveCount(2); await expect(title).toContainText(name);
  await page.screenshot({ path: info.outputPath('readable-name-autosaved.png') });
});

test('an older in-flight save cannot lose a newer edit', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await add(page); await saved(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(r => { release = r; }); const requestStarted = new Promise<void>(r => { started = r; });
  let first = true;
  await page.route('**/api/library/save', async route => { if (first) { first = false; started(); await gate; } await route.continue(); });
  await add(page); await requestStarted; await add(page);
  release(); await saved(page);
  await expect.poll(async () => (await stored(page, baseURL!)).show.scenes[0].surfaces.length).toBe(3);
  await page.reload(); await expect(layers(page)).toHaveCount(3);
});

test('offline refresh retains edits and offers an explicit recovery copy', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await add(page); await saved(page);
  await page.route('**/api/**', route => route.abort());
  await add(page); await page.reload();
  await expect(layers(page)).toHaveCount(2);
  await expect(page.getByRole('tablist', {name:'Open shows'}).getByRole('tab', { selected: true }).getByRole('status')).toHaveText('Saved in this tab');
  await page.unroute('**/api/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await recoverCopy(page, 'Recovered offline work');
  await saved(page); expect((await stored(page, baseURL!)).show.scenes[0].surfaces).toHaveLength(2);
});

test('a revision conflict keeps both versions and offers Save a copy', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await add(page); await saved(page);
  const original = await stored(page, baseURL!); original.show.scenes[0].name = 'Changed in another tab';
  const response = await page.request.post('/api/library/save', { headers: { Origin: baseURL! }, data: { app: 'map', id: original.id, expected_revision: original.revision,
    data_base64: Buffer.from(JSON.stringify(original.show)).toString('base64') } });
  expect(response.ok()).toBe(true);
  await add(page);
  await expect(page.locator('.map-file-tabs').getByRole('button', {name:'Save a copy', exact:true})).toBeVisible();
  await page.reload(); await expect(layers(page)).toHaveCount(2);
  await expect(page.locator('.map-file-tabs').getByRole('button', {name:'Save a copy', exact:true})).toBeVisible();
  await page.locator('.map-file-tabs').getByRole('button', {name:'Save a copy', exact:true}).click();
  const dialog = page.getByRole('dialog', { name: 'Save show' });
  await dialog.getByRole('textbox').fill('Recovered copy'); await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await saved(page); await expect.poll(() => new URL(page.url()).searchParams.get('document')).not.toBe(original.id);
  expect((await stored(page, baseURL!, original.id)).show.scenes[0].surfaces).toHaveLength(1);
  expect((await stored(page, baseURL!)).show.scenes[0].surfaces).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('recovered-conflict-copy.png') });
});
