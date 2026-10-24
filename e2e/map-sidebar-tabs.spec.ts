import { expect, test } from '@playwright/test';
import { openAppSettings, clickRibbon, signIn, switchWorkspace } from './helpers';

test('Map supports detached top tabs and remembers bottom tabs across workspaces and reload', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  await clickRibbon(page, 'Cube');
  const shell = page.locator('.aui-shell');
  await expect(shell).toHaveAttribute('data-sidebar-variant', 'tabs-top');
  await expect(page.getByRole('toolbar', { name: 'Left sidebar tabs' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Right sidebar tabs' })).toBeVisible();
  const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
  const open = async () => openAppSettings(page);
  const close = async () => settings.getByRole('button', { name: /Close/ }).click();
  await open();
  await expect(settings.getByRole('combobox', { name: 'Sidebar tabs' })).toHaveValue('tabs-top');
  await expect(settings.getByRole('combobox', { name: 'Sidebar position' })).toHaveCount(0);
  await settings.getByRole('combobox', { name: 'Workspace layout' }).selectOption('floating');
  await settings.getByRole('button', { name: 'Toolbars & tabs', exact: true }).click();
  await settings.getByRole('combobox', { name: 'Sidebar container' }).selectOption('detached');
  await settings.getByRole('button', { name: 'Workspace', exact: true }).click();
  await close();
  for (const name of ['Left sidebar', 'Right sidebar']) {
    const sidebar = page.getByRole('complementary', { name, exact: true });
    await expect(sidebar).toHaveCSS('border-top-width', '0px');
    await expect(sidebar).toHaveCSS('padding', '0px');
    await expect(sidebar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(sidebar.locator('.aui-tabbed-sidebar-content')).toHaveCSS('border-top-width', '1px');
    await expect(sidebar.locator('.aui-shell-panel-header')).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: /^(Float|Dock|Close) / })).toHaveCount(0);
  }
  await expect.poll(() => page.getByRole('complementary', { name: 'Left sidebar', exact: true }).evaluate(element => {
    const frame = element.getBoundingClientRect();
    const area = element.closest('.aui-shell-area')!.getBoundingClientRect();
    const toolbar = element.closest('.aui-shell-area')!.querySelector('.aui-shell-fltoolbar')!.getBoundingClientRect();
    return frame.top >= toolbar.bottom + 21 && Math.abs(area.bottom - frame.bottom - 10) < 1 && frame.height > 300;
  })).toBe(true);
  await page.screenshot({ path: info.outputPath('map-top-tabs.png'), animations: 'disabled' });
  await open();
  await settings.getByRole('combobox', { name: 'Sidebar tabs' }).selectOption('tabs-bottom');
  await close();
  await expect(shell).toHaveAttribute('data-sidebar-variant', 'tabs-bottom');
  await switchWorkspace(page, 'Visualization');
  await expect(shell).toHaveAttribute('data-sidebar-variant', 'tabs-bottom');
  await page.reload();
  await expect(shell).toHaveAttribute('data-sidebar-variant', 'tabs-bottom');
  await expect(shell).toHaveAttribute('data-layout', 'floating');
  await open();
  await settings.getByRole('combobox', { name: 'Sidebar tabs' }).selectOption('rail');
  await expect(settings.getByRole('combobox', { name: 'Sidebar position' })).toHaveValue('outside');
  await close();
  await expect(shell).toHaveAttribute('data-sidebar-variant', 'rail');
  await expect(page.locator('.aui-tabbed-sidebar[data-orientation=vertical]')).toHaveCount(2);
  await expect(page.getByRole('complementary', { name: 'Left sidebar', exact: true })).toHaveAttribute('data-tabs', 'right');
});


test('Map combined horizontal trays close to the bottom corners at desktop and tablet widths', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  for (const width of [1600, 1000]) {
    await page.setViewportSize({width,height:1000});
    await page.emulateMedia({reducedMotion: width === 1000 ? 'reduce' : 'no-preference'});
    for (const position of ['tabs-top','tabs-bottom']) {
      await openAppSettings(page);
      const settings = page.getByRole('dialog',{name:'Aether Map settings'});
      await settings.getByRole('button',{name:'Toolbars & tabs',exact:true}).click();
      await settings.getByRole('combobox',{name:'Sidebar container'}).selectOption('attached');
      await settings.getByRole('combobox',{name:'Sidebar tab placement'}).selectOption(position);
      await settings.getByRole('combobox',{name:'Sidebar opening direction'}).selectOption('inside');
      await settings.getByRole('button',{name:/Close/}).click();
      for (const side of ['Left','Right']) {
        const card = page.getByRole('complementary',{name:`${side} sidebar`,exact:true});
        const active = card.locator('.aui-tabbed-sidebar-tabs button[aria-pressed="true"]');
        if (await active.count()) await active.click();
        await expect(card).toHaveAttribute('data-expanded','false');
        await expect.poll(() => card.evaluate(node => {
          const bounds = node.getBoundingClientRect();
          const area = node.closest('.aui-shell-area')!.getBoundingClientRect();
          return Math.abs(area.bottom - bounds.bottom - 10) < 1 && bounds.height <= 52;
        })).toBe(true);
      }
      await page.screenshot({path:info.outputPath(`map-bottom-corners-${position}-${width}.png`),animations:'disabled'});
      for (const side of ['Left','Right']) {
        const card=page.getByRole('complementary',{name:`${side} sidebar`,exact:true});
        await card.getByRole('toolbar').getByRole('button').first().click();
        await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(60);
      }
    }
  }
});
