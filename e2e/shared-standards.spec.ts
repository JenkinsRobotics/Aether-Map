import { expect, test, type Page } from '@playwright/test';
import { openAppSettings, signIn, switchWorkspace } from './helpers';

test('shared spacing starts with standard defaults, persists custom values and resets without disabling protection', async ({page,context,baseURL}) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  const open = async () => {
    await openAppSettings(page);
    const settings = page.getByRole('dialog',{name:'Aether Map settings'});
    await settings.getByRole('button',{name:'Workspace spacing',exact:true}).click();
    return settings;
  };
  let settings = await open();
  const margin = settings.getByRole('textbox',{name:'Workspace margin'});
  const clearance = settings.getByRole('textbox',{name:'Floating control clearance'});
  await expect(margin).toHaveValue('10');
  await expect(clearance).toHaveValue('22');
  await margin.fill('24'); await margin.press('Enter');
  await clearance.fill('36'); await clearance.press('Enter');
  await expect(page.locator('.aui-shell-main')).toHaveCSS('padding','0px');
  await expect(page.locator('.aui-shell')).toHaveCSS('--aui-workspace-inset-bottom','24px');
  await settings.getByRole('button',{name:'Workspace',exact:true}).click();
  await settings.getByRole('combobox',{name:'Workspace layout'}).selectOption('floating');
  await settings.getByRole('button',{name:/Close/}).click();
  await expect.poll(() => page.locator('.aui-shell').evaluate(el => {
    const content = el.querySelector('.aui-shell-center')!.getBoundingClientRect();
    const toolbar = el.querySelector('.aui-shell-fltoolbar')!.getBoundingClientRect();
    return Math.round(content.top + parseFloat(getComputedStyle(el).getPropertyValue('--aui-workspace-inset-top')) - toolbar.bottom);
  })).toBe(36);
  await page.reload();
  settings = await open();
  await expect(settings.getByRole('textbox',{name:'Workspace margin'})).toHaveValue('24');
  await expect(settings.getByRole('textbox',{name:'Floating control clearance'})).toHaveValue('36');
  // A second application window follows changes through the shared preference.
  const other = await context.newPage();
  await other.goto('/map/index.html?new=show');
  await expect(other.locator('.aui-shell')).toHaveCSS('--aui-workspace-inset-bottom','24px');
  await page.bringToFront();
  await settings.getByRole('button',{name:'Restore Aether UI defaults'}).click();
  await expect(other.locator('.aui-shell')).toHaveCSS('--aui-workspace-inset-bottom','10px');
  await expect(settings.getByRole('textbox',{name:'Floating control clearance'})).toHaveValue('22');
  await expect(page.locator('.aui-shell')).toHaveAttribute('data-measure-insets','true');
  await other.close();
});

async function checkSafeArea(page: Page, floating: boolean) {
  const shell = page.locator('.aui-shell').first();
  await expect(shell).toHaveAttribute('data-measure-insets', 'true');
  await expect.poll(async () => shell.evaluate(el => {
    const canvas = el.querySelector('.aui-shell-center')!.getBoundingClientRect();
    const css = getComputedStyle(el);
    const inset = (edge: string) => parseFloat(css.getPropertyValue(`--aui-workspace-inset-${edge}`)) || 0;
    const center = {width: canvas.width, height:canvas.height, top:canvas.top+inset('top'),left:canvas.left+inset('left'),right:canvas.right-inset('right')};
    const toolbar = el.querySelector('.aui-shell-fltoolbar')?.getBoundingClientRect();
    const left = el.querySelector('.aui-shell-fledge--left')?.getBoundingClientRect();
    const right = el.querySelector('.aui-shell-fledge--right')?.getBoundingClientRect();
    return center.width > 100 && center.height > 100 &&
      (!toolbar || center.top >= toolbar.bottom + 20) &&
      (!left || left.width === 0 || center.left >= left.right + 20) &&
      (!right || right.width === 0 || center.right <= right.left - 20);
  })).toBe(true);
  if (!floating) {
    await expect(shell.locator('.aui-shell-main')).toHaveCSS('padding', '0px');
  }
}

test('safe workspace clearance follows toolbar and panel changes without a setting', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await page.getByRole('region',{name:'Map tools'}).getByRole('button',{name:'Cube',exact:true}).click();
  const settings = page.getByRole('dialog',{name:'Aether Map settings'});
  for (const layout of ['docked','floating','canvas'] as const) {
    await openAppSettings(page);
    await settings.getByRole('combobox',{name:'Workspace layout'}).selectOption(layout);
    await settings.getByRole('button',{name:/Close/}).click();
    for (const workspace of ['Mapping','Visualization'] as const) {
      await switchWorkspace(page,workspace);
      await checkSafeArea(page,layout !== 'docked');
      await page.screenshot({path:info.outputPath(`${layout}-${workspace}.png`)});
    }
  }
  await expect(page.locator('.map-outline')).toHaveCount(3);
});

test('Map settings persist appearance and icon packs, shared with Animation and Sketch', async ({page,context,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await openAppSettings(page);
  const settings = page.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await settings.getByRole('combobox',{name:'Tool icon pack'}).selectOption('graphite-ribbon');
  await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
  await expect(page.locator('.map-ribbon [data-icon-pack="graphite-ribbon"]').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('shared-appearance-settings.png')});
  await settings.getByRole('button',{name:/Close/}).click();
  await page.reload();
  await expect(page.locator('.map-ribbon [data-icon-pack="graphite-ribbon"]').first()).toBeVisible();
  for (const app of ['animation','sketch']) {
    const enabled = await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    expect(enabled.ok()).toBe(true);
    const other = await context.newPage();
    await other.goto(`/${app}/index.html`);
    await openAppSettings(other);
    const common = other.getByRole('dialog');
    await expect(common.getByRole('combobox',{name:'Color mode'})).toHaveValue('dark');
    await expect(common.getByRole('combobox',{name:'Tool icon pack'})).toHaveValue('graphite-ribbon');
    await common.getByRole('combobox',{name:'Tool icon pack'}).selectOption('classic');
    await expect(page.locator('.map-ribbon [data-icon-pack="graphite-ribbon"]')).toHaveCount(0);
    await common.getByRole('combobox',{name:'Tool icon pack'}).selectOption('graphite-ribbon');
    await expect(page.locator('.map-ribbon [data-icon-pack="graphite-ribbon"]').first()).toBeVisible();
    await other.close();
  }
});

test('shared safe areas reach CAD, Animation, Sketch and the migrated Anima demo', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  for (const app of ['cad','animation','sketch','ui']) {
    expect((await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}})).ok()).toBe(true);
    await page.goto(app === 'ui' ? '/ui/index.html?demo=animation-studio' : `/${app}/index.html${app === 'cad' ? '?new=part' : ''}`);
    if (app === 'cad') await page.getByRole('button',{name:'Create Part',exact:true}).click();
    const shell = page.locator('.aui-shell').first();
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute('data-measure-insets','true');
    {
      for (let i=0; i<3 && await shell.getAttribute('data-layout') !== 'floating'; i++) {
        await page.getByRole('button',{name:/^(Layout |Studio mode:)/}).first().click();
      }
    }
    await expect(shell).toHaveAttribute('data-layout','floating');
    await checkSafeArea(page,true);
    if (app === 'ui') {
      // Legacy frame insets must not apply the shared clearance twice.
      await expect.poll(() => shell.evaluate(el => {
        const center=el.querySelector('.aui-shell-center')!.getBoundingClientRect();
        const frame=el.querySelector('.animation-assets-panel')!.getBoundingClientRect();
        const css=getComputedStyle(el);
        return Math.max(Math.abs(frame.x-center.x-parseFloat(css.getPropertyValue('--aui-workspace-inset-left'))),
          Math.abs(frame.y-center.y-parseFloat(css.getPropertyValue('--aui-workspace-inset-top'))));
      })).toBeLessThan(2);
    }
    if (app === 'cad') {
      await openAppSettings(page);
      const settings = page.getByRole('dialog',{name:'Aether CAD Settings'});
      await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
      await expect(settings.getByRole('combobox',{name:'Tool icon pack'})).toBeVisible();
      await settings.getByRole('button',{name:/Close/}).click();
    }
    await page.screenshot({path:info.outputPath(`${app}-shared-safe-area.png`)});
  }
});
