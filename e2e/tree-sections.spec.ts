import { expect, test } from '@playwright/test';
import { signIn, openPanel } from './helpers';

for (const app of ['cad', 'map']) {
  test(`${app} uses independent resizable tree sections`, async ({ page, baseURL }, info) => {
    await signIn(page, baseURL!);
    await page.request.post('/api/admin/apps', {headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    if (app === 'map') await page.addInitScript(() => {
      if (!localStorage.getItem('split-migration-test')) {
        localStorage.setItem('aether-map.mapping', JSON.stringify({version:1,layouts:{docked:{outputs:{placement:'docked'},layers:{placement:'hidden'}}}}));
        localStorage.setItem('split-migration-test','true');
      }
    });
    await page.goto(`/${app}/index.html?new=${app === 'cad' ? 'part' : 'show'}`);
    if(app === 'cad') await page.getByRole('button',{name:'Create Part',exact:true}).click();
    await openPanel(page,'Features and parts');
    const split = page.locator('.aui-tree-panel-split:visible');
    await expect(split).toBeVisible();
    const sections = split.locator(':scope > section');
    await expect(sections).toHaveCount(2);
    await expect(split.locator('.aui-collection-footer')).toHaveCount(0);
    const heading = sections.nth(0).locator('.aui-collection-heading');
    expect(await heading.getByRole('button').count()).toBeLessThanOrEqual(3);
    const more = heading.getByRole('button',{name:/^More /});
    await more.click();
    const menu = page.locator('[role=menu]:visible');
    await expect(menu).toBeVisible();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual((await heading.boundingBox())!.y);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(sections.nth(0).getByRole('tree')).toBeVisible();
    await expect(sections.nth(1).getByRole('tree')).toBeVisible();
    if(app === 'map') {
      await expect(page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true}).getByRole('button',{name:'Outputs',exact:true})).toHaveCount(0);
      await sections.nth(1).getByRole('treeitem').first().click();
      await expect(sections.nth(1).getByRole('treeitem').first()).toHaveAttribute('aria-selected','true');
    } else {
      await expect(sections.nth(0).locator('.aui-collection-heading')).toContainText('Features');
      await expect(sections.nth(0).locator('.aui-collection-heading').getByRole('button',{name:'New folder'})).toBeVisible();
      await expect(sections.nth(0).locator('.aui-collection-heading').getByRole('button',{name:'Edit feature'})).toBeVisible();
    }
    const separator = split.getByRole('separator');
    const before = await sections.nth(0).boundingBox();
    const handle = (await separator.boundingBox())!;
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2,handle.y-85,{steps:10});
    await page.mouse.up();
    await expect.poll(async () => (await sections.nth(0).boundingBox())!.height).toBeLessThan(before!.height-50);
    const key = app === 'cad' ? 'aether-cad.feature-parts-split' : 'aether-map.layers-outputs-split';
    const saved = await page.evaluate(key => localStorage.getItem(key),key);
    expect(Number(saved)).toBeLessThan(.65);
    await page.screenshot({path:info.outputPath(`${app}-tree-sections.png`)});
    await page.reload();
    await expect(page.locator('.aui-tree-panel-split:visible')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key),key)).toBe(saved);
    await separator.dblclick();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key),key)).toBe('0.65');
  });
}
