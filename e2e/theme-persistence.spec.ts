import { expect, test, type Page } from '@playwright/test';
import { openAppSettings, signIn } from './helpers';

async function refreshAccount(page: Page) {
  // Wait for the account bootstrap to apply the response, not just fetch it.
  await page.evaluate(() => new Promise<void>(resolve => {
    document.addEventListener('aether-account', () => resolve(), {once:true});
    window.dispatchEvent(new Event('focus'));
  }));
}

test('Map theme survives account refresh, reload and shared browser tabs', async ({page,context,baseURL}) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await openAppSettings(page);
  const appearance = page.getByRole('dialog',{name:'Aether Map settings'});
  await appearance.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await appearance.getByRole('combobox',{name:'Interface theme'}).selectOption('midnight');
  await appearance.getByRole('button',{name:/Close/}).click();
  await expect(page.locator('html')).toHaveClass(/aether-theme-midnight/);
  await refreshAccount(page);
  await expect(page.locator('html')).toHaveClass(/aether-theme-midnight/);
  await page.reload();
  await refreshAccount(page);
  await expect(page.locator('html')).toHaveClass(/aether-theme-midnight/);


  const other = await context.newPage();
  await other.goto('/map/index.html?new=show');
  await refreshAccount(other);
  await expect(other.locator('html')).toHaveClass(/aether-theme-midnight/);
  await openAppSettings(other);
  const settings = other.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await expect(settings.getByRole('combobox',{name:'Interface theme'})).toHaveValue('midnight');
  await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/aether-theme-aether-studio/);
  await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
  await page.reload();
  await refreshAccount(page);
  await expect(page.locator('html')).toHaveClass(/aether-theme-aether-studio/);
  await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
  await other.close();
});

test('host theme is the fallback and an explicit default survives reload', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  const preferences = (theme_id: string) => page.request.post('/api/preferences', {
    headers: {Origin:baseURL!}, data: {theme_id},
  });
  expect((await preferences('midnight')).ok()).toBe(true);
  try {
    await page.goto('/map/index.html?new=show');
    await refreshAccount(page);
    await expect(page.locator('html')).toHaveClass(/aether-theme-midnight/);

    await openAppSettings(page);
    const settings = page.getByRole('dialog',{name:'Aether Map settings'});
    await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
    await expect(settings.getByRole('combobox',{name:'Interface theme'})).toHaveValue('midnight');
    await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-default');
    await page.reload();
    await refreshAccount(page);
    await expect(page.locator('html')).not.toHaveClass(/aether-theme-/);
    await page.evaluate(() => {
      localStorage.removeItem('aether-theme');
      document.dispatchEvent(new Event('aether-theme'));
    });
    await expect(page.locator('html')).toHaveClass(/aether-theme-midnight/);

  } finally {
    expect((await preferences('')).ok()).toBe(true);
  }
});
