import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('Vector sidebar replaces the header and keeps account/settings usable in both sizes', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: 'vector', enabled: true } })).ok()).toBe(true);
  await page.goto('/vector/index.html');
  const sidebar = page.getByRole('complementary', { name: 'Aether Vector sidebar' });
  await expect(sidebar).toBeVisible();
  await expect(page.locator('.aui-coming-top')).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Aether Vector home' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Aether Studio', exact: true })).toHaveAttribute('href', '/');
  const account = sidebar.locator('.suite-account > summary');
  const settings = sidebar.locator('.suite-settings > summary');
  await expect(account).toBeVisible();
  expect((await account.boundingBox())!.y).toBeGreaterThan(900);
  for (const collapsed of [false, true]) {
    if (collapsed) {
      await sidebar.getByRole('button', { name: 'Collapse Aether Vector sidebar' }).click();
      await page.reload();
      await expect(sidebar.getByRole('button', { name: 'Expand Aether Vector sidebar' })).toBeVisible();
    }
    await account.click();
    const menu = sidebar.locator('.suite-account-menu');
    await expect(menu.getByRole('button', { name: 'View account' })).toBeVisible();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThan(1000);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    await account.click();
    await settings.click();
    await expect(sidebar.getByRole('combobox', { name: 'Theme' })).toBeVisible();
    const settingsBounds = (await sidebar.locator('.suite-settings-menu').boundingBox())!;
    expect(settingsBounds.x).toBeGreaterThanOrEqual(0);
    await sidebar.getByRole('combobox', { name: 'Theme' }).selectOption(collapsed ? 'light' : 'dark');
    if (await sidebar.locator('.suite-settings').getAttribute('open') !== null) await settings.click();
    await page.screenshot({ path: info.outputPath(collapsed ? 'collapsed-light.png' : 'expanded-dark.png') });
    await settings.click();
    await sidebar.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Aether Vector settings' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Toolbars & tabs', exact: true }).click();
    await dialog.getByRole('button', { name: /Close/ }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar.getByRole('button', { name: 'Expand Aether Vector sidebar' })).toBeVisible();
  await settings.click();
  const mobileMenu = (await sidebar.locator('.suite-settings-menu').boundingBox())!;
  expect(mobileMenu.x).toBeGreaterThanOrEqual(0);
  expect(mobileMenu.x + mobileMenu.width).toBeLessThanOrEqual(390);
  await settings.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('mobile.png') });
  await sidebar.getByRole('button', { name: 'Expand Aether Vector sidebar' }).click();
  await account.click();
  expect((await sidebar.locator('.suite-account-menu').boundingBox())!.x).toBeGreaterThanOrEqual(0);
  expect((await sidebar.boundingBox())!.x).toBe(0);
  await page.screenshot({ path: info.outputPath('mobile-expanded.png') });
});
