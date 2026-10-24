import { expect, test } from '@playwright/test';
import { openAppSettings, clickRibbon, signIn, switchWorkspace } from './helpers';

test('side rails retain outside default; inside is accessible, reversible and remembered', async ({ page, baseURL }, info) => {
  await page.addInitScript(() => localStorage.setItem('aether-map.sidebar-variant', 'rail'));
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'Cube');
  const shell = page.locator('.aui-shell');
  const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
  const position = settings.getByRole('combobox', { name: 'Sidebar position' });
  const layout = settings.getByRole('combobox', { name: 'Workspace layout' });
  const open = async () => openAppSettings(page);
  const close = async () => settings.getByRole('button', { name: /Close/ }).click();
  const checkOrder = async (outside: boolean, floating: boolean) => {
    const prefix = floating ? '.aui-shell-fledge' : '.aui-shell-side';
    const left = page.locator(floating ? `${prefix}--left` : `${prefix}:not(${prefix}--right)`);
    const right = page.locator(`${prefix}--right`);
    for (const [side, first] of [[left, outside], [right, !outside]] as const) {
      // Read both boxes in the same frame after the opening animation settles.
      await expect.poll(() => side.evaluate((el, {first, floating}) => {
        const rail = el.querySelector('.aui-rail')!.getBoundingClientRect();
        const stack = el.querySelector(floating ? '.aui-shell-flstack' : '.aui-shell-stack')!.getBoundingClientRect();
        return first ? stack.right <= rail.left + 1 : rail.right <= stack.left + 1;
      }, {first, floating})).toBe(true);
    }
  };
  await expect(shell).toHaveClass(/panels-outer-edge/);
  await checkOrder(true, false);
  await page.screenshot({ path: info.outputPath('outside-docked.png') });
  await open();
  await expect(position).toHaveValue('outside');
  await position.selectOption('inside');
  await close();
  await checkOrder(false, false);
  await page.screenshot({ path: info.outputPath('inside-docked.png') });
  await page.reload();
  await expect(shell).not.toHaveClass(/panels-outer-edge/);
  await switchWorkspace(page, 'Visualization');
  await expect(shell).not.toHaveClass(/panels-outer-edge/);
  await open();
  await position.selectOption('outside');
  await layout.selectOption('floating');
  await close();
  await checkOrder(true, true);
  await page.screenshot({ path: info.outputPath('outside-floating.png') });
  await open();
  await position.selectOption('inside');
  await close();
  await checkOrder(false, true);
  await open();
  await position.selectOption('outside');
  await layout.selectOption('docked');
  await close();
  await page.reload();
  await checkOrder(true, false);
  await expect(page.locator('.map-surface')).toHaveCount(3);
});
