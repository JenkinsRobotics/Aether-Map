import { expect, test, type Locator } from '@playwright/test';
import { signIn, openAppSettings } from './helpers';
async function settle(card: Locator) {
  await card.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))); });
}
async function tightTray(card:Locator) {
  await expect(card).toHaveAttribute('data-expanded','false');
  await expect.poll(()=>card.evaluate(node=>{
    const c=node.getBoundingClientRect(),tray=node.querySelector('.aui-tabbed-sidebar-tabs')!;
    const children=Array.from(tray.children).map(n=>n.getBoundingClientRect());
    const vertical=node.getAttribute('data-orientation')==='vertical';
    const length=vertical?Math.max(...children.map(b=>b.bottom))-Math.min(...children.map(b=>b.top)):Math.max(...children.map(b=>b.right))-Math.min(...children.map(b=>b.left));
    return Math.abs((vertical?c.height:c.width)-length-8);
  })).toBeLessThan(2);
}
test('floating cards fit icons and right editor content while left/docked stay full height',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'ui',enabled:true}});
  await page.goto('/ui/index.html#tab=widgets');
  const demo=page.getByRole('region',{name:'Full-height tabbed sidebar showcase'});
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('combobox',{name:'Sidebar attachment preview'}).selectOption('attached');
  for(const side of ['left','right']) {
    await demo.getByRole('combobox',{name:'Tabbed sidebar side'}).selectOption(side);
    for(const position of ['Top','Bottom','Side']) {
      const preview=demo.getByRole('region',{name:`${position} tabs preview`});
      const card=preview.locator('.aui-tabbed-sidebar');
      const tab=card.getByRole('toolbar').getByRole('button',{name:'Structure',exact:true});
      if (await tab.getAttribute("aria-pressed") !== "true") await tab.click();
      await settle(card);
      const available=await card.evaluate(node=>node.parentElement!.getBoundingClientRect().height);
      const opened=(await card.boundingBox())!;
      if(side==='left') expect(opened.height).toBeCloseTo(available,0);
      else expect(opened.height).toBeLessThan(available-100);
      await tab.click(); await tightTray(card);
      await tab.click(); await settle(card);
      await expect(card.getByRole('checkbox',{name:'Body 01'})).toBeChecked();
    }
  }
  await demo.screenshot({path:info.outputPath('content-sized-right.png'),animations:'disabled'});
  await demo.getByRole('combobox',{name:'Floating panel height'}).selectOption('fixed');
  for (const card of await demo.locator('.aui-tabbed-sidebar').all()) {
    await expect.poll(async ()=>(await card.boundingBox())!.height).toBe(360);
  }
  await demo.getByRole('combobox',{name:'Floating panel height'}).selectOption('auto');
  await demo.getByRole('combobox',{name:'Tabbed sidebar layout'}).selectOption('docked');
  for(const card of await demo.locator('.aui-tabbed-sidebar').all()) {
    await expect.poll(()=>card.evaluate(n=>Math.abs(n.getBoundingClientRect().height-n.closest('.aui-shell-area')!.getBoundingClientRect().height))).toBeLessThan(1);
  }
});
test('CAD floating side rails fit icons and keep all inspector tabs reachable',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/cad/index.html?new=part');
  await page.getByRole('button',{name:'Create Part',exact:true}).click();
  await openAppSettings(page);
  const settings=page.getByRole('dialog');
  await settings.getByRole('button',{name:'Toolbars & tabs',exact:true}).click();
  await settings.getByRole('combobox',{name:'Sidebar tab placement'}).selectOption('rail');
  await settings.getByRole('combobox',{name:'Sidebar opening direction'}).selectOption('inside');
  await settings.getByRole('button',{name:/Close/}).click();
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  for(const side of ['Left','Right']) {
    const card=page.getByRole('complementary',{name:`${side} sidebar`,exact:true});
    const active=card.locator('.aui-tabbed-sidebar-tabs button[aria-pressed="true"]');
    if(await active.count()) await active.click();
    await tightTray(card);
    await expect(card.getByRole('toolbar').getByRole('button').last()).toBeInViewport();
  }
  await page.screenshot({path:info.outputPath('cad-compact-rails.png'),animations:'disabled'});
  const right=page.getByRole('complementary',{name:'Right sidebar',exact:true});
  await right.getByRole('toolbar').getByRole('button').first().click();
  await settle(right);
  expect((await right.boundingBox())!.height).toBeLessThan(800);
  await page.screenshot({path:info.outputPath('cad-content-inspector.png'),animations:'disabled'});
  await openAppSettings(page);
  await settings.getByRole('button',{name:'Toolbars & tabs',exact:true}).click();
  await settings.getByRole('combobox',{name:'Sidebar tab placement'}).selectOption('tabs-top');
  await settings.getByRole('button',{name:/Close/}).click();
  await right.getByRole('toolbar').getByRole('button').first().click();
  await tightTray(right);
  await expect(right.getByRole('toolbar').getByRole('button').last()).toBeInViewport();
  await page.screenshot({path:info.outputPath('cad-horizontal-icons.png'),animations:'disabled'});
  await openAppSettings(page);
  await settings.getByRole('button',{name:'Toolbars & tabs',exact:true}).click();
  await settings.getByRole('combobox',{name:'Sidebar tab placement'}).selectOption('rail');
  await settings.getByRole('button',{name:/Close/}).click();
  await page.setViewportSize({width:1000,height:500});
  await right.getByRole('toolbar').getByRole('button').first().focus();
  await page.keyboard.press('End');
  await expect.poll(() => right.evaluate(node => {
    const box=node.getBoundingClientRect(), parent=node.parentElement!.getBoundingClientRect();
    const last=node.querySelector('.aui-tabbed-sidebar-tabs')!.lastElementChild!.getBoundingClientRect();
    return box.bottom <= parent.bottom+1 && last.bottom <= box.bottom;
  })).toBe(true);
});
