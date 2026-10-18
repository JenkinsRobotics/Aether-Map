import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

for (const demo of ['animation-studio', 'cad-workspace', 'gallery']) {
  test(`${demo} compares shared sidebar designs and remembers its choice`, async ({page,baseURL},info) => {
    await signIn(page,baseURL!);
    expect((await page.request.post('/api/admin/apps', {
      headers:{Origin:baseURL!},data:{id:'ui',enabled:true},
    })).ok()).toBe(true);
    await page.goto(demo === 'gallery' ? '/ui/index.html' : `/ui/index.html?demo=${demo}`);
    const shell = page.locator('.aui-shell').first();
    await expect(shell).toHaveAttribute('data-sidebar-variant','rail');
    for (const [id,label] of [['tabs-top','Top tabs'],['tabs-bottom','Bottom tabs'],['rail','Side rail'],['tabs-bottom','Bottom tabs']]) {
      await page.getByRole('button',{name:/^Sidebar design:/}).first().click();
      await page.getByRole('menuitemradio',{name:label,exact:true}).click();
      await expect(shell).toHaveAttribute('data-sidebar-variant',id);
      if (id !== 'rail') {
        const tabs = shell.locator('.aui-tabbed-sidebar-tab');
        await expect(tabs.first()).toBeVisible();
        if (await tabs.first().getAttribute('aria-pressed') !== 'true') await tabs.first().click();
        await expect(shell.locator('.aui-tabbed-sidebar-content').first()).toBeVisible();
        await expect(shell.locator('.aui-shell-panel-header')).toHaveCount(0);
      }
    }
    await page.screenshot({path:info.outputPath(`${demo}-bottom-tabs.png`)});
    await page.reload();
    await expect(shell).toHaveAttribute('data-sidebar-variant','tabs-bottom');
    if (demo === 'animation-studio') {
      await page.getByRole('button',{name:'Aether Animation Studio settings',exact:true}).click();
      const settings = page.getByRole('dialog',{name:'Aether Animation Studio Settings'});
      await expect(settings.getByRole('combobox',{name:'Sidebar design'})).toHaveValue('tabs-bottom');
      await settings.getByRole('combobox',{name:'Sidebar design'}).selectOption('tabs-top');
      await expect(shell).toHaveAttribute('data-sidebar-variant','tabs-top');
      await expect(settings.getByRole('checkbox',{name:'Push panels to the outer edge'})).toHaveCount(0);
    }
    // Comparisons are scoped to the demo and cannot change Map's preference.
    expect(await page.evaluate(() => localStorage.getItem('aether-map.sidebar-variant'))).toBeNull();
  });
}
