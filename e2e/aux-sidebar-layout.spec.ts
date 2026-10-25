import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

const bottom = (page: import('@playwright/test').Page, selector: string) => page.locator(selector).first().evaluate(e => Math.round(e.getBoundingClientRect().bottom));

// The Comments panel ends where the dock row ends, and with no dock where the
// side panels end; it never runs past the window.
test('the Comments panel lines up with the dock, open or closed',async({page,baseURL})=>{
  await page.setViewportSize({width:1600,height:1000});
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await page.getByRole('button',{name:/^Comments/}).first().click();
  const aux='.aui-studio-aux-sidebar';
  await expect.poll(()=>bottom(page,aux)).toBe(await bottom(page,'.aui-shell-bottom > *'));
  await switchWorkspace(page,'Content');
  await page.getByRole('button',{name:'Timeline',exact:true}).first().click();
  await expect(page.locator('.aui-shell-bottom > *')).toHaveCount(0);
  if (!(await page.locator(aux).boundingBox())?.height) await page.getByRole('button',{name:/^Comments/}).first().click();
  await expect.poll(()=>bottom(page,aux)).toBe(await bottom(page,'.aui-shell-fledge--left'));
});
