import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace,clickRibbon} from './helpers';

test('sidebar workspaces keep a selector-free toolbar only in Mapping',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  const nav=page.getByRole('navigation',{name:'Workspaces'});
  await expect(nav.getByRole('button',{name:'Mapping',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.map-ribbon')).toBeVisible();
  await expect(page.locator('.aui-shell-toolbar')).toBeVisible();
  await expect(page.getByRole('button',{name:/^Workspace:/})).toHaveCount(0);
  await expect(page.locator('.map-mapping-tools')).toHaveCount(0);
  await expect(page.locator('[data-icon-missing]')).toHaveCount(0);
  await clickRibbon(page,'Cube');
  await expect(page.locator('.map-surface')).toHaveCount(3);
  await clickRibbon(page,'Rectangle');
  await expect(page.locator('.map-canvas-host')).toHaveClass(/is-drawing/);
  await clickRibbon(page,'Select');
  await expect(page.locator('.map-canvas-host')).not.toHaveClass(/is-drawing/);
  await clickRibbon(page,'Square');
  await expect(page.locator('.map-canvas-host')).toHaveClass(/is-drawing/);
  await clickRibbon(page,'Select');
  await page.screenshot({path:info.outputPath('mapping-header.png')});
  // Workspace controls remain keyboard accessible in the global rail.
  await nav.getByRole('button',{name:'Mapping',exact:true}).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(nav.getByRole('button',{name:'Visualization',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.map-ribbon')).toHaveCount(0);
  const pool=page.getByRole('region',{name:'Media Pool',exact:true});
  await pool.getByRole('tab',{name:'Generators',exact:true}).click();
  await pool.getByRole('button',{name:'New shader',exact:true}).click();
  await expect(page.locator('.map-input-preview')).toBeVisible();
  await page.getByRole('button',{name:'Input preview',exact:true}).click();
  await expect(page.locator('.map-input-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'Input preview',exact:true}).click();
  await expect(page.locator('.map-input-preview')).toBeVisible();
  await page.screenshot({path:info.outputPath('visualization-header.png')});
  await switchWorkspace(page,'Show');
  const show=page.getByRole('region',{name:'Show workspace',exact:true});
  await expect(show).toBeVisible();
  const left=page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true});
  for(const name of ['Features and parts','Version control','Create version','Comments','Document notes','Reminders','AI advisor','Action items','Part manager']) {
    await expect(left.getByRole('button',{name,exact:true})).toBeVisible();
  }
  await expect(left.getByRole('button',{name:'Outputs',exact:true})).toHaveAttribute('aria-pressed','true');
  await left.getByRole('button',{name:'Version control',exact:true}).click();
  await expect(page.getByRole('region',{name:'Versions and history',exact:true})).toBeVisible();
  await left.getByRole('button',{name:'Comments',exact:true}).click();
  await expect(page.getByRole('region',{name:'Comments',exact:true})).toBeVisible();
  await left.getByRole('button',{name:'Action items',exact:true}).click();
  await expect(page.getByRole('region',{name:'Action items',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('show-standard-tray.png')});
  await left.getByRole('button',{name:'Outputs',exact:true}).click();
  await show.getByRole('tab',{name:'Players',exact:true}).click();
  await expect(show.getByRole('button',{name:'Set up a new one'})).toBeVisible();
  await show.getByRole('tab',{name:'Export',exact:true}).click();
  await expect(show.getByRole('heading',{name:'Export & recording'})).toBeVisible();
  await show.getByRole('tab',{name:'Show',exact:true}).click();
  await page.locator('.aui-application-sidebar .suite-settings > summary').click();
  await page.locator('.aui-application-sidebar .suite-settings').getByRole('combobox',{name:'Theme'}).selectOption('dark');
  await page.screenshot({path:info.outputPath('show-header.png')});
  for(const layout of ['Docked','Canvas','Floating']) {
    await page.getByRole('button',{name:`Studio mode: ${layout}`,exact:true}).click();
    await expect(nav).toBeVisible();
    await expect(page.locator('.aui-shell-fltoolbar')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'Collapse Aether Map sidebar'}).click();
  for(const width of [1200,1000,800,640,480]) {
    await page.setViewportSize({width,height:900});
    await switchWorkspace(page,'Visualization');
    await switchWorkspace(page,'Mapping');
    await expect(nav).toBeInViewport();
    const globalSidebar = page.getByRole('complementary',{name:'Aether Map sidebar',exact:true});
    expect((await globalSidebar.boundingBox())!.x).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  }
  await page.screenshot({path:info.outputPath('compact-header.png')});
  await page.reload();
  await expect(nav.getByRole('button',{name:'Mapping',exact:true})).toHaveAttribute('aria-pressed','true');
});
