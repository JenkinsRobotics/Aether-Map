import {expect,test} from '@playwright/test';
import {signIn,openAppSettings} from './helpers';

test('shared sidebars resize in docked and floating layouts, remember overrides and reset to defaults',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);await page.goto('/map/index.html?new=show');
  const left=page.getByRole('complementary',{name:'Left sidebar',exact:true});
  const right=page.getByRole('complementary',{name:'Right sidebar',exact:true});
  for(const mode of ['Docked','Floating']) {
    await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');await page.getByRole('menuitemradio',{name:mode,exact:true}).click();
    for (const side of ['left','right'] as const) {
      const card=side==='left'?left:right;
      const tabs=card.getByRole('toolbar').getByRole('button');
      if(!await card.locator('.aui-tabbed-sidebar-tabs [aria-pressed="true"]').count()) await tabs.first().click();
      const handle=card.getByRole('separator',{name:`Resize ${side} sidebar width`});
      const initial=Number(await handle.getAttribute('aria-valuenow'));
      const rect=(await handle.boundingBox())!;
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width/2+(side==='left'?90:-90),rect.y+rect.height/2,{steps:8});await page.mouse.up();
      await expect(handle).toHaveAttribute('aria-valuenow',String(initial+90));
      await expect.poll(async()=>(await card.boundingBox())!.width).toBeCloseTo(initial+90,0);
      const active=card.locator('.aui-tabbed-sidebar-tabs [aria-pressed="true"]');const name=await active.getAttribute('aria-label');
      await active.click();await card.getByRole('toolbar').getByRole('button',{name:name!,exact:true}).click();
      await expect(handle).toHaveAttribute('aria-valuenow',String(initial+90));
      await handle.press('Home');await expect(handle).toHaveAttribute('aria-valuenow',String(initial));
    }
  }
  await openAppSettings(page);const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Toolbars & tabs',exact:true}).click();
  await dialog.getByRole('combobox',{name:'Sidebar tab placement'}).selectOption('rail');await dialog.getByRole('button',{name:/Close/}).click();
  const height=right.getByRole('separator',{name:'Resize right sidebar height'});
  await right.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
  const initialHeight=(await right.boundingBox())!.height;
  await height.press('Shift+ArrowDown');
  await expect.poll(async()=>(await right.boundingBox())!.height).toBeCloseTo(initialHeight+50,0);
  const width=right.getByRole('separator',{name:'Resize right sidebar width'});
  const initialWidth=Number(await width.getAttribute('aria-valuenow'));
  await width.press('Shift+ArrowLeft');
  await page.reload();
  await expect(width).toHaveAttribute('aria-valuenow',String(initialWidth+50));
  await expect.poll(async()=>(await right.boundingBox())!.height).toBeCloseTo(initialHeight+50,0);
  await page.screenshot({path:info.outputPath('resized-map-sidebar.png'),animations:'disabled'});
  await width.dblclick();await expect(width).toHaveAttribute('aria-valuenow',String(initialWidth));
  await height.dblclick();await expect.poll(async()=>(await right.boundingBox())!.height).toBeCloseTo(initialHeight,0);
});

test('detached showcase sidebars retain manual sizing as a secondary design',async({page,baseURL})=>{
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'ui',enabled:true}});
  await page.goto('/ui/index.html#tab=widgets');
  const demo=page.getByRole('region',{name:'Full-height tabbed sidebar showcase'});
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('combobox',{name:'Sidebar attachment preview'}).selectOption('detached');
  const card=demo.getByRole('region',{name:'Top tabs preview'}).getByRole('complementary',{name:'Right sidebar',exact:true});
  const initial=(await card.boundingBox())!.height;
  await card.getByRole('separator',{name:'Resize right sidebar height'}).press('Shift+ArrowDown');
  await expect.poll(async()=>(await card.boundingBox())!.height).toBeCloseTo(initial-50,0);
  await card.getByRole('separator',{name:'Resize right sidebar height'}).press('Home');
  await expect.poll(async()=>(await card.boundingBox())!.height).toBeCloseTo(initial,0);
});
