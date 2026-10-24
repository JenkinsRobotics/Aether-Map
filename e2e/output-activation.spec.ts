import { expect, test } from '@playwright/test';
import { emptyShow } from '../src/document';
import { openPanel, signIn } from './helpers';

test('output selection reveals properties; repeated activation focuses the same running window, including after editor reload', async ({ page, context, baseURL }, info) => {
  await signIn(page, baseURL!);
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', name: 'Output activation.aethermap', scope: 'personal',
    data_base64: Buffer.from(JSON.stringify(emptyShow())).toString('base64'),
  } });
  expect(response.ok()).toBe(true);
  const file = await response.json();
  await page.goto(`/map/index.html?document=${file.id}`);
  await openPanel(page, 'Outputs');
  const properties = page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Properties"]');
  await openPanel(page, 'Properties');
  await properties.click();
  const row = page.getByRole('tree', { name: 'Outputs', exact: true }).getByRole('treeitem').first();
  await row.click();
  await expect(properties).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Scene shown on this output' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Crop width', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('output-properties.png') });

  const popup = page.waitForEvent('popup');
  await row.dblclick();
  const output = await popup;
  await expect(output.locator('.map-output')).toHaveAttribute('data-link', 'live');
  // A DOM marker and navigation counter detect replacement/reload as well as
  // accidental closing; counting tabs alone would miss a refreshed projector.
  await output.evaluate(() => {
    document.body.dataset.runningOutput = 'preserved';
    const focus = window.focus.bind(window);
    window.focus = () => {
      document.body.dataset.focusCalls = String(Number(document.body.dataset.focusCalls ?? 0) + 1);
      focus();
    };
  });
  let navigations = 0;
  output.on('framenavigated', frame => { if (frame === output.mainFrame()) navigations++; });
  await page.bringToFront();
  await row.dblclick();
  await expect(output.locator('body')).toHaveAttribute('data-focus-calls', '1');
  expect(context.pages()).toHaveLength(2);
  expect(output.isClosed()).toBe(false);
  await expect(output.locator('body')).toHaveAttribute('data-running-output', 'preserved');

  await page.reload();
  await openPanel(page, 'Outputs');
  await row.dblclick();
  await expect(output.locator('body')).toHaveAttribute('data-focus-calls', '2');
  await expect(output.locator('body')).toHaveAttribute('data-running-output', 'preserved');
  await expect(output.locator('.map-output')).toHaveAttribute('data-link', 'live');
  expect(navigations).toBe(0);
  expect(context.pages()).toHaveLength(2);

  // Properties is also a discoverable row command; closing is explicit.
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click();
  await expect(properties).toHaveAttribute('aria-pressed', 'true');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close output window', exact: true }).click();
  await expect.poll(() => output.isClosed()).toBe(true);
  const reopened = page.waitForEvent('popup');
  await row.dblclick();
  const nextOutput = await reopened;
  await expect(nextOutput.locator('.map-output')).toHaveAttribute('data-link', 'live');
  await nextOutput.close();
});
