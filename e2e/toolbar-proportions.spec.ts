import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

test('Mapping toolbar spans the center between full-height sidebars across layouts',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);await page.goto('/map/index.html?new=show');
  const header=page.getByRole('complementary',{name:'Aether Map sidebar',exact:true});
  const height=(await header.boundingBox())!.height;
  // Top tools and bottom tray share the center column; both inspectors extend beside them.
  const toolbar=page.locator('.aui-shell-toolbar');
  const center=page.locator('.aui-shell-center');
  for (const width of [1600, 1200]) {
    await page.setViewportSize({width,height:1000});
    await expect.poll(async()=>{
      const t=(await toolbar.boundingBox())!, c=(await center.boundingBox())!;
      return Math.abs(t.x-c.x)+Math.abs(t.width-c.width);
    }).toBeLessThan(2);
    const t=(await toolbar.boundingBox())!;
    for (const name of ['Left sidebar','Right sidebar']) {
      const side=page.getByRole('complementary',{name,exact:true});
      const b=(await side.boundingBox())!;
      expect(b.y).toBeLessThanOrEqual(t.y+1);
      expect(name==='Left sidebar'?b.x+b.width<=t.x+1:b.x>=t.x+t.width-1).toBe(true);
    }
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.screenshot({path:info.outputPath('center-toolbar.png'),animations:'disabled'});
  for(const layout of ['Docked','Canvas','Floating']) {
    if(layout==='Canvas') await page.locator('.aui-shell-edge--top').hover();
    const tools=page.getByRole('region',{name:'Map tools'});
    const bounds=(await tools.getByRole('button',{name:'Rectangle',exact:true}).boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(40);expect(bounds.height).toBeGreaterThanOrEqual(34);
    for(const room of ['Visualization','Show','Mapping'] as const) {
      await switchWorkspace(page,room);
      expect((await header.boundingBox())!.height).toBe(height);
      await expect(page.locator('.aui-workspace-ribbon')).toHaveCount(room==='Mapping'&&layout!=='Canvas'?1:0);
      await expect(page.getByRole('button',{name:/^Workspace:/})).toHaveCount(0);
    }
    await page.getByRole('button',{name:`Studio mode: ${layout}`,exact:true}).click();
  }
});
