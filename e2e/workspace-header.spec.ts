import { expect, test } from '@playwright/test';
import { createIOProject, signIn } from './helpers';
for (const [app,name] of [['cad','CAD'],['io','IO'],['sketch','Sketch'],['animation','Animation'],['ui','UI']]) {
  test(`${name} workspace shares identity and right-hand chrome`,async ({page,baseURL},info)=>{
    await signIn(page,baseURL!);
    await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    await page.goto(`/${app}/index.html${app==='map'?'?new=show':app==='cad'?'?new=part':''}`);
    if(app==='cad') await page.getByRole('button',{name:'Create Part',exact:true}).click();
    if(app==='io') await createIOProject(page);
    const bar=page.locator(`.aui-document-bar[data-application="${app}"]`);
    await expect(bar).toBeVisible();
    await expect(bar.locator('.aui-application-identity strong')).toHaveText(`Aether ${name}`);
    const launcher=bar.getByRole('button',{name:'Aether Studio applications',exact:true});
    const home=bar.getByRole('link',{name:`Aether ${name} home`,exact:true});
    const layout=bar.getByRole('button',{name:/^Studio mode:/});
    const windows=bar.getByRole('button',{name:'Workspace windows and tabs',exact:true});
    const gear=bar.getByRole('button',{name:'Settings',exact:true});
    const account=bar.locator('.suite-account > summary');
    await expect(gear).toBeVisible();
    for(const width of [1600,1000]) {
      await page.setViewportSize({width,height:1000});
      const controls=[launcher,home,layout,windows,gear,account];
      const bounds=await Promise.all(controls.map(async l=>(await l.boundingBox())!));
      for(let i=1;i<bounds.length;i++) expect(bounds[i].x).toBeGreaterThanOrEqual(bounds[i-1].x+bounds[i-1].width);
      expect(bounds.at(-1)!.x+bounds.at(-1)!.width).toBeLessThanOrEqual(width);
      const leading=(await bar.locator(':scope > .aui-document-bar-cluster').first().boundingBox())!;
      const trailing=(await bar.locator('.aui-document-bar-cluster--trailing').boundingBox())!;
      expect(leading.x+leading.width).toBeLessThanOrEqual(trailing.x+1);
    }
    await launcher.click();
    await expect(page.getByRole('menuitem',{name:new RegExp(`Aether ${name}`)})).toBeVisible();
    await page.keyboard.press('Escape');
    await layout.press('ArrowDown');
    await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
    await expect(layout).toHaveAccessibleName('Studio mode: Floating');
    await windows.click();
    const popupPromise=page.waitForEvent('popup');
    await page.getByRole('menuitem',{name:'New Workspace Tab',exact:true}).click();
    const popup=await popupPromise; await popup.close();
    await gear.click();
    await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Appearance & icons',exact:true}).click();
    await expect(dialog.getByRole('combobox',{name:'Interface theme',exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:/Close/}).click();
    await page.screenshot({path:info.outputPath(`${app}-workspace-header.png`),animations:'disabled'});
  });
}
