import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

async function openDocument(page: Page, app: string) {
  await page.goto('/');
  const id = await page.evaluate(async app => {
    const { createDocument } = await import(`/${app}/create-document.js`);
    const file: File = await createDocument('Inspector review', false);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file);
    });
    const response = await fetch('/api/library/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, name: file.name, scope: 'personal', data_base64: data }) });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).id;
  }, app);
  await page.goto(`/${app}/index.html?document=${id}`);
  return id;
}

for (const app of ['io', 'sketch', 'cad', 'animation']) {
  test(`${app} uses shared compact properties in both themes`, async ({ page, baseURL }, info) => {
    await signIn(page, baseURL!);
    await openDocument(page, app);
    const label = app === 'animation' ? 'Inspector' : app === 'cad' ? 'Parameters' : 'Properties';
    const rail = page.getByRole('button', { name: label, exact: true });
    await expect(rail).toBeVisible();
    if (await rail.getAttribute('aria-pressed') !== 'true') await rail.click();
    if (app === 'animation') {
      // Empty characters still have a document inspector with real metadata.
      await page.getByRole('button', { name: 'Character', exact: true }).click();
    }
    const panel = page.locator('.aui-inspector:visible').filter({ has: page.locator('.aui-field-row') }).last();
    await expect(panel).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.classList.toggle('aether-light-theme', theme === 'light'); document.documentElement.classList.toggle('aether-dark-theme', theme === 'dark'); }, theme);
      await expect.poll(() => panel.evaluate(el => {
        const rows = [...el.querySelectorAll('.aui-field-row')].filter(row => row.checkVisibility());
        return rows.length > 0 && rows.every(row => {
          const label = row.querySelector('.aui-field-row-heading')!.getBoundingClientRect();
          const editor = row.querySelector('.aui-field-row-editor')!.getBoundingClientRect();
          return Math.abs(label.top + label.height / 2 - editor.top - editor.height / 2) < 3;
        }) && el.scrollWidth <= el.clientWidth + 1;
      })).toBe(true);
      await page.screenshot({ path: info.outputPath(`${app}-${theme}.png`) });
    }
    if (app === 'io') {
      const name = page.getByRole('textbox', { name: 'Component name', exact: true });
      await name.fill('Edited through shared inspector');
      await name.blur();
      await expect(name).toHaveValue('Edited through shared inspector');
      await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveCount(0);
    }
    if (app === 'sketch') {
      await page.getByRole('combobox', { name: 'Fill type', exact: true }).selectOption('linear');
      await expect(page.getByRole('textbox', { name: 'Stop 1 color', exact: true })).toBeVisible();
    }
  });
}


// Jonathan deferred Drive to its active owner; re-enable when that integration lands.
test.fixme('Drive and application home details share the inspector and keep file actions', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const id = await openDocument(page, 'cad');
  await page.goto(`/drive/?file=${id}`);
  const drive = page.getByRole('complementary', { name: 'File details' });
  await expect.poll(() => drive.locator('.aui-field-row--inline').count()).toBeGreaterThanOrEqual(4);
  await expect(drive.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  await page.screenshot({path: info.outputPath('drive-details.png')});
  await page.goto('/cad/');
  await page.getByRole('button', { name: 'My files', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Inspector review.acpart' }).first().click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const details = page.locator('.library-details');
  await expect.poll(() => details.locator('.aui-field-row--inline').count()).toBeGreaterThanOrEqual(4);
  await expect(details.getByRole('button', { name: 'Open file', exact: true })).toBeVisible();
  await page.screenshot({path: info.outputPath('library-details.png')});
});
