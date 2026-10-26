import { expect, test } from '@playwright/test';
import { signIn, saveShow } from './helpers';

test('shared panel headers and reconnect notifications retain their bounds in both themes', async ({page,baseURL}, info) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await saveShow(page,'Panel appearance check');
  const rail=page.getByRole('toolbar',{name:'Aux toolbar'});
  const sidebar=page.locator('.aui-studio-aux-sidebar');
  const header=sidebar.locator('.aui-side-panel-header');
  const measure=()=>header.evaluate(el=>{
    const title=el.querySelector('h2')!,style=getComputedStyle(title),box=el.getBoundingClientRect();
    const parent=el.closest('.aui-studio-aux-sidebar')!.getBoundingClientRect();
    const icon=el.querySelector('svg')!.getBoundingClientRect();
    const bell=el.querySelector('[aria-label="Panel notifications"]')!.getBoundingClientRect();
    return {x:box.x-parent.x,y:box.y-parent.y,width:box.width,height:box.height,font:style.fontSize,weight:style.fontWeight,color:style.color,icon:[icon.width,icon.height],bell:[bell.x-parent.x,bell.y-parent.y,bell.width,bell.height]};
  });
  for(const theme of ['dark','light']){
    await page.evaluate(theme=>{document.documentElement.classList.toggle('aether-light-theme',theme==='light');document.documentElement.dataset.aetherTheme=theme;},theme);
    let expected;
    for(const [tab,title] of [['Comments','Comments & tasks'],['AI advisor','AI chat'],['Files','Files'],['Version control','History & versions']]){
      await rail.getByRole('button',{name:tab,exact:true}).click();
      await expect(header.getByRole('heading',{name:title,exact:true})).toBeVisible();
      const bounds=await measure();
      if(expected)expect(bounds).toEqual(expected);else expected=bounds;
      await expect(sidebar.locator('[data-icon-missing]')).toHaveCount(0);
      await page.screenshot({path:info.outputPath(`${theme}-${tab.replaceAll(' ','-')}.png`)});
    }
    const before=await measure(), search=await sidebar.getByRole('searchbox').boundingBox();
    await page.route('**/api/status',route=>route.abort());
    await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
    await expect(sidebar.locator('.aui-panel-notifications-dot')).toBeVisible();
    expect(await measure()).toEqual(before);
    expect(await sidebar.getByRole('searchbox').boundingBox()).toEqual(search);
    await header.getByRole('button',{name:'Panel notifications'}).click();
    await expect(page.getByRole('dialog',{name:'Panel notifications'})).toContainText('Live updates are disconnected');
    expect(await measure()).toEqual(before);
    await page.screenshot({path:info.outputPath(`${theme}-notification.png`)});
    await page.keyboard.press('Escape');
    await page.unroute('**/api/status');
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await expect(sidebar.locator('.aui-panel-notifications-dot')).toHaveCount(0);
  }
});
