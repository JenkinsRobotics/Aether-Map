import { expect, test, type Page } from '@playwright/test';
import { openAppSettings, signIn, openPanel, switchWorkspace } from './helpers';

const leftRail = (page: Page) => page.locator('.aui-shell-side:not(.aui-shell-side--right) :is(.aui-rail-button,.aui-tabbed-sidebar-tab), .aui-shell-fledge--left :is(.aui-rail-button,.aui-tabbed-sidebar-tab)');
const rightRail = (page: Page) => page.locator('.aui-shell-side--right :is(.aui-rail-button,.aui-tabbed-sidebar-tab), .aui-shell-fledge--right :is(.aui-rail-button,.aui-tabbed-sidebar-tab)');

test('Map replaces sidebar panels in every layout and remembers single selection', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.addInitScript(() => {
    if (!localStorage.getItem('e2e-old-sidebar-seeded')) {
      const old = { layers: { placement: 'docked' }, outputs: { placement: 'docked' } };
      localStorage.setItem('aether-map.mapping',JSON.stringify({version:1,layouts:{docked:old,floating:old,canvas:old}}));
      localStorage.setItem('e2e-old-sidebar-seeded','true');
    }
  });
  await page.goto('/map/index.html?new=show');
  await expect(leftRail(page)).toHaveCount(9); // Outputs now shares Features and parts.
  await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  for (const layout of ['docked','floating','canvas']) {
    await openAppSettings(page);
    const settings = page.getByRole('dialog',{name:'Aether Map settings'});
    await settings.getByRole('combobox',{name:'Workspace layout'}).selectOption(layout);
    await settings.getByRole('button',{name:/Close/}).click();
    if (layout === 'canvas' && !(await leftRail(page).first().isVisible())) await page.locator('.aui-shell-edge--left').hover();
    await openPanel(page,'Outputs');
    await expect(page.getByRole('tree',{name:'Outputs',exact:true})).toBeVisible();
    await expect(page.getByRole('tree',{name:'Layers',exact:true})).toBeVisible();
    await openPanel(page,'Comments');
    await expect(page.getByRole('tree',{name:'Layers',exact:true})).toBeHidden();
    await expect(page.getByRole('tree',{name:'Outputs',exact:true})).toBeHidden();
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
    if (layout === 'docked') await page.screenshot({path:info.outputPath('map-comments-replaces-layers.png'),animations:'disabled'});
    await openPanel(page,'Layers');
    await expect(page.getByRole('tree',{name:'Layers',exact:true})).toBeVisible();
    await expect(page.getByRole('tree',{name:'Outputs',exact:true})).toBeVisible();
    await page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Features and parts"]').click();
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(0);
    await expect(page.locator('.aui-shell-panel[data-closing="true"]')).toHaveCount(0);
    if (layout === 'canvas' && !(await leftRail(page).first().isVisible())) await page.locator('.aui-shell-edge--left').hover();
    await openPanel(page,'Outputs');
    await page.reload();
    if (layout === 'canvas' && !(await leftRail(page).first().isVisible())) await page.locator('.aui-shell-edge--left').hover();
    await expect(page.locator(':is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="Features and parts"]')).toHaveAttribute('aria-pressed','true');
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
    if (layout === 'docked') await page.screenshot({path:info.outputPath('map-single-sidebar.png'),animations:'disabled'});
  }
});

test('Map collection tabs share the sidebar with Comments in every workspace', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  for (const workspace of ['Mapping', 'Visualization', 'Show'] as const) {
    await switchWorkspace(page,workspace);
    await openPanel(page,'Comments');
    await expect(page.getByRole('tree',{name:'Layers',exact:true})).toBeHidden();
    await expect(page.getByRole('tree',{name:'Outputs',exact:true})).toBeHidden();
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
    await openPanel(page,'Layers');
    await expect(page.getByRole('tree',{name:'Layers',exact:true})).toBeVisible();
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  }
});

test('CAD, Animation, Sketch and Anima demo inherit independent single-panel rails', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  for (const app of ['cad','animation','sketch','ui']) {
    expect((await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}})).ok()).toBe(true);
    await page.goto(app === 'ui' ? '/ui/index.html?demo=animation-studio' : `/${app}/index.html${app === 'cad' ? '?new=part' : ''}`);
    if (app === 'cad') await page.getByRole('button',{name:'Create Part',exact:true}).click();
    await expect(page.locator('.aui-shell').first()).toHaveAttribute('data-panel-selection','single');
    for (const buttons of [leftRail(page),rightRail(page)]) {
      await expect(buttons.first()).toBeVisible();
      for (let i=0;i<Math.min(3,await buttons.count());i++) {
        if(await buttons.nth(i).getAttribute('aria-haspopup') === 'dialog') continue;
        if (await buttons.nth(i).getAttribute('aria-pressed') !== 'true') await buttons.nth(i).click();
        await expect(buttons.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
        await expect(buttons.nth(i)).toHaveAttribute('aria-pressed','true');
      }
    }
    await expect(leftRail(page).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  }
});
