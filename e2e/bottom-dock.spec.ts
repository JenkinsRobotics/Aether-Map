import { expect, test, type Page } from '@playwright/test';
import { signIn, openBottomDock, switchWorkspace } from './helpers';

const card = (page:Page) => page.getByRole('complementary',{name:'Map workspace dock',exact:true});
async function settled(page:Page) {
  await card(page).evaluate(async node=> { await Promise.all(node.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))); });
}
async function centered(page:Page, open:boolean) {
  await expect.poll(()=>card(page).evaluate((node, open)=>{
    const c=node.getBoundingClientRect(), frame=node.parentElement!.getBoundingClientRect();
    const workspace=node.closest(".aui-shell-area")!.getBoundingClientRect();
    const anchor=node.getAttribute("data-floating")==="true" ? workspace : frame;
    return Math.abs((c.left+c.right)/2-(anchor.left+anchor.right)/2)<2 && Math.abs(c.bottom-frame.bottom)<2 && (!open || c.width>=frame.width*.6-2) && c.width<=frame.width+2;
  },open)).toBe(true);
}
test('Map bottom dock centers, collapses, resizes and preserves room preferences',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await expect(card(page)).toBeVisible();
  for(const mode of ['Docked','Floating','Canvas']) {
    await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
    await page.getByRole('menuitemradio',{name:mode,exact:true}).click();
    await openBottomDock(page,'Surfaces'); await settled(page); await centered(page,true);
    const canvas=(await page.locator('.map-canvas-host').first().boundingBox())!;
    const stage=(await page.locator('.map-stage').boundingBox())!;
    expect(canvas.height).toBeCloseTo(stage.height,0);
    const tabs=page.getByRole('toolbar',{name:'Map workspace dock tabs'});
    const surfacesTab=tabs.getByRole('button',{name:'Surfaces',exact:true});
    if(mode==='Docked') {
      const heights=await surfacesTab.evaluate(async button=>{
        const dock=button.closest('.aui-tabbed-sidebar')!;
        const samples=[dock.getBoundingClientRect().height];
        (button as HTMLButtonElement).click();
        for(let frame=0;frame<30;frame++) {
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          samples.push(dock.getBoundingClientRect().height);
        }
        return samples;
      });
      expect(heights.some(h=>h>heights.at(-1)!+2 && h<heights[0]-2)).toBe(true);
    } else await surfacesTab.click();
    await expect(card(page)).toHaveAttribute('data-open','false'); await settled(page); await centered(page,false);
    if(mode==='Docked') {
      const dock=(await card(page).boundingBox())!, center=(await page.locator('.map-editor .aui-shell-center').boundingBox())!;
      expect(dock.width).toBeCloseTo(center.width,0);
      expect(dock.x).toBeCloseTo(center.x,0);
      expect(dock.y+dock.height).toBeCloseTo(center.y+center.height,0);
      await expect(card(page)).toHaveCSS('border-radius','0px');
      await expect(card(page)).toHaveCSS('box-shadow','none');
      await expect(card(page).getByRole('separator',{name:'Resize bottom dock width',exact:true})).toHaveCount(0);
    } else expect((await card(page).boundingBox())!.width).toBeLessThan(160);
    expect((await card(page).boundingBox())!.height).toBeLessThan(60);
    const closedCanvas=(await page.locator('.map-canvas-host').first().boundingBox())!;
    if(mode==='Docked') {
      expect(closedCanvas.height).toBeGreaterThan(canvas.height+60);
      expect(closedCanvas.y+closedCanvas.height).toBeCloseTo((await card(page).boundingBox())!.y,0);
    } else expect(closedCanvas.height).toBeCloseTo(canvas.height,0);
    await openBottomDock(page,'Surfaces'); await settled(page);
    await expect(card(page).getByRole('button',{name:'New surface',exact:true})).toBeVisible();
    if(mode==='Docked') {
      const opened=(await card(page).boundingBox())!;
      expect((await page.locator('.map-canvas-host').first().boundingBox())!.height).toBeCloseTo(canvas.height,0);
      expect(canvas.y+canvas.height).toBeCloseTo(opened.y,0);
      await page.screenshot({path:info.outputPath('bottom-dock-docked.png'),animations:'disabled'});
    }
  }
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  const widthHandle=card(page).getByRole('separator',{name:'Resize bottom dock width',exact:true});
  const widthBefore=Number(await widthHandle.getAttribute('aria-valuenow'));
  await widthHandle.press('Shift+ArrowRight');await expect(widthHandle).toHaveAttribute('aria-valuenow',String(widthBefore+50));
  await widthHandle.dblclick();await expect(widthHandle).toHaveAttribute('aria-valuenow',String(widthBefore));
  await switchWorkspace(page,'Visualization');
  await openBottomDock(page,'Timeline'); await settled(page);
  await expect(page.locator('.map-timeline')).toBeVisible();
  const handle=card(page).getByRole('separator',{name:'Resize bottom dock',exact:true});
  const before=Number(await handle.getAttribute('aria-valuenow'));
  await handle.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow',String(before+10));
  await page.getByRole('toolbar',{name:'Map workspace dock tabs'}).getByRole('button',{name:'Timeline',exact:true}).click();
  await page.getByRole('toolbar',{name:'Map workspace dock tabs'}).getByRole('button',{name:'Surfaces',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Audio mixer'})).toHaveCount(0);
  await switchWorkspace(page,'Mapping'); await expect(card(page)).toHaveAttribute('data-open','true');
  await switchWorkspace(page,'Visualization'); await expect(card(page)).toHaveAttribute('data-open','false');
  await openBottomDock(page,'Timeline'); await expect(handle).toHaveAttribute('aria-valuenow',String(before+10));
  await switchWorkspace(page,'Mapping');
  for(const viewport of [{width:1600,height:1000},{width:1000,height:700},{width:640,height:600}]) {
    await page.setViewportSize(viewport); await settled(page); await centered(page,true);
    await expect(card(page).getByRole('button',{name:'New surface',exact:true})).toBeInViewport();
    await expect.poll(async()=>{const zoom=(await page.locator('.map-zoom').boundingBox())!, dock=(await card(page).boundingBox())!;return zoom.y+zoom.height<=dock.y;}).toBe(true);
    await page.screenshot({path:info.outputPath(`bottom-dock-${viewport.width}.png`),animations:'disabled'});
  }
  await page.getByRole('toolbar',{name:'Map workspace dock tabs'}).getByRole('button',{name:'Surfaces',exact:true}).click();
  await page.reload(); await expect(card(page)).toHaveAttribute('data-open','false');
  await page.getByRole('button',{name:'Document controls',exact:true}).click();
  await page.getByRole('menuitem',{name:'Export options…',exact:true}).click();
  await expect(page.getByText('Project bundle',{exact:true})).toBeVisible();
});

test('shared showcase keeps edited content when the bottom card collapses',async({page,baseURL})=>{
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'ui',enabled:true}});
  await page.goto('/ui/index.html#tab=widgets');
  const demo=page.getByRole('region',{name:'Bottom dock showcase'});await demo.scrollIntoViewIfNeeded();
  const field=demo.getByRole('textbox',{name:'Demo duration'});
  await field.fill('23');await field.press('Tab');
  const tab=demo.getByRole('toolbar',{name:'Bottom workspace dock tabs'}).getByRole('button',{name:'Timeline',exact:true});
  await tab.click();await expect(tab).toHaveAttribute('aria-pressed','false');
  await expect(demo.getByRole('textbox',{name:'Demo duration'})).toHaveCount(0);
  await tab.click();await expect(field).toHaveValue('23');
  await demo.getByRole('combobox',{name:'Bottom dock layout'}).selectOption('docked');
  await expect(field).toHaveValue('23');
  const dock=demo.getByRole('complementary',{name:'Bottom workspace dock',exact:true});
  await expect(dock).toHaveAttribute('data-floating','false');
  await expect.poll(()=>dock.evaluate(n=>Math.abs(n.getBoundingClientRect().width-n.closest('.aui-shell-center')!.getBoundingClientRect().width))).toBeLessThan(1);
  await demo.getByRole('combobox',{name:'Bottom dock layout'}).selectOption('floating');
  await expect(field).toHaveValue('23');
  await expect(dock).toHaveAttribute('data-floating','true');
});


test('floating bottom dock stays at the window center throughout sidebar toggles',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  await openBottomDock(page,'Surfaces');
  const tabs=page.getByRole('toolbar',{name:'Map workspace dock tabs'});
  for(const expanded of [true,false]) {
    if(!expanded) await tabs.getByRole('button',{name:'Surfaces',exact:true}).click();
    await expect(card(page)).toHaveAttribute('data-open',String(expanded));
    await settled(page);
    const before=(await card(page).boundingBox())!;
    expect(before.x+before.width/2).toBeCloseTo(page.viewportSize()!.width/2,0);
    for(const [side,label] of [['Left','Features and parts'],['Right','Properties'],['Left','Features and parts'],['Right','Properties']]) {
      const button=page.getByRole('toolbar',{name:`${side} sidebar tabs`,exact:true}).getByRole('button',{name:label,exact:true});
      const samples=await button.evaluate(async button=>{
        const dock=document.querySelector<HTMLElement>('[aria-label="Map workspace dock"]')!;
        const samples=[];
        (button as HTMLButtonElement).click();
        for(let frame=0;frame<24;frame++) {
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          const rect=dock.getBoundingClientRect();
          samples.push({center:rect.x+rect.width/2,width:rect.width,bottom:rect.bottom});
        }
        return samples;
      });
      for(const sample of samples) {
        expect(sample.center).toBeCloseTo(page.viewportSize()!.width/2,0);
        expect(sample.width).toBeCloseTo(before.width,0);
        expect(sample.bottom).toBeCloseTo(before.y+before.height,0);
      }
    }
    await page.screenshot({path:info.outputPath(`stable-bottom-${expanded?'expanded':'collapsed'}.png`),animations:'disabled'});
  }
});
