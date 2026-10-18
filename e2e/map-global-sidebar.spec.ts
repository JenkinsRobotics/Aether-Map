import { expect, test } from '@playwright/test';
import { clickRibbon, openAppSettings, saveShow, signIn, switchWorkspace } from './helpers';

test('global sidebar owns Map navigation and account while workspace tools remain usable', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  const sidebar=page.getByRole('complementary',{name:'Aether Map sidebar',exact:true});
  await expect(sidebar).toBeVisible();
  await expect(page.locator('.map-document-bar')).toHaveCount(0);
  await expect(sidebar.getByRole('link',{name:'Aether Map home'})).toHaveAttribute('href','/map/');
  await clickRibbon(page,'Cube');
  await saveShow(page,'Sidebar show');
  const id=new URL(page.url()).searchParams.get('document');
  const workspace=page.locator('.map-editor-workspace');
  const expandedWidth=(await workspace.boundingBox())!.width;
  await page.screenshot({path:info.outputPath('mapping-expanded.png')});
  await sidebar.getByRole('button',{name:'Collapse Aether Map sidebar'}).click();
  await expect.poll(async()=>(await workspace.boundingBox())!.width).toBeGreaterThan(expandedWidth+150);
  await switchWorkspace(page,'Visualization');
  await expect(sidebar.getByRole('button',{name:'Expand Aether Map sidebar'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Media Pool',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('visualization-collapsed.png')});
  await switchWorkspace(page,'Show');
  await expect(page.getByRole('region',{name:'Show workspace',exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('document')).toBe(id);
  const tabs=page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true});
  for(const name of ['Version control','Comments','Action items']) {
    await tabs.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('region',{name:name==='Version control'?'Versions and history':name,exact:true})).toBeVisible();
  }
  await sidebar.getByRole('button',{name:'Aether Studio applications'}).click();
  await expect(page.getByRole('menuitem',{name:/Aether Map/})).toBeVisible();
  await page.keyboard.press('Escape');
  await openAppSettings(page);
  const dialog=page.getByRole('dialog',{name:'Aether Map settings'});
  await expect(dialog.getByRole('combobox',{name:'Workspace layout'})).toBeVisible();
  await dialog.getByRole('button',{name:'Close Aether Map settings'}).click();
  await sidebar.locator('.suite-account > summary').click();
  const menu=sidebar.locator('.suite-account-menu');
  await expect(menu.getByRole('button',{name:'View account'})).toBeVisible();
  const bounds=(await menu.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  await sidebar.locator('.suite-account > summary').click();
  await page.reload();
  await expect(sidebar.getByRole('button',{name:'Expand Aether Map sidebar'})).toBeVisible();
  await switchWorkspace(page,'Mapping');
  await expect(page.locator('.map-surface')).toHaveCount(3);
  for (const preset of ['Docked','Canvas','Floating']) {
    await sidebar.getByRole('button',{name:`Studio mode: ${preset}`,exact:true}).click();
    await expect(sidebar.getByRole('navigation',{name:'Workspaces'})).toBeVisible();
  }
  await page.setViewportSize({width:800,height:700});
  await expect(sidebar.getByRole('button',{name:'Settings',exact:true})).toBeInViewport();
  await sidebar.getByRole('button',{name:'Expand Aether Map sidebar'}).click();
  await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBe(248);
  await page.screenshot({path:info.outputPath('mapping-narrow.png'),animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(800);
});
