import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace,clickRibbon,players,rightTab} from './helpers';

// The three workspaces (Mapping, Scene, Show) share the standard frame; the
// one file row lists the document's typed entries.
test('Mapping, Scene and Show each own their job and share one file row',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await expect(page.getByRole('button',{name:'Workspace: Mapping',exact:true})).toBeVisible();
  await expect(page.locator('[data-icon-missing]')).toHaveCount(0);
  // Mapping: surfaces, canvases, outputs; drawing tools.
  for(const name of ['Layers','Outputs']) await expect(page.getByRole('tree',{name}).first()).toBeVisible();
  await clickRibbon(page,'Cube');
  await expect(page.locator('.map-surface')).toHaveCount(3);
  await clickRibbon(page,'Rectangle');
  await expect(page.locator('.map-canvas-host')).toHaveClass(/is-drawing/);
  await clickRibbon(page,'Select');
  await expect(page.locator('.map-canvas-host')).not.toHaveClass(/is-drawing/);
  await page.screenshot({path:info.outputPath('mapping.png')});
  // Scene: reusable content. Add a generator layer from the gallery.
  await switchWorkspace(page,'Scene');
  await page.locator('.map-visual-panel-title').getByRole('button',{name:'Add layer'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Add visual to scene'}).click();
  await expect(page.getByRole('region',{name:'Layer properties'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Scene preview'})).toBeVisible();
  await page.screenshot({path:info.outputPath('scene.png')});
  // Show: every canvas live, the show timeline, cues and players.
  await switchWorkspace(page,'Show');
  await expect(page.getByRole('list',{name:'Canvases'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Show timeline'})).toBeVisible();
  await expect(page.getByRole('tree',{name:'Cues'})).toBeVisible();
  const devices=await players(page);
  await expect(devices.getByRole('button',{name:'Set up a new one'})).toBeVisible();
  await devices.getByRole('button',{name:'Done',exact:true}).click();
  await rightTab(page,'Export');
  await expect(page.getByRole('region',{name:'Record an output'})).toBeVisible();
  await page.screenshot({path:info.outputPath('show.png')});
  // The one file row: the document, then its Show and Scene entries. Canvases
  // are not files; they live in Mapping's layer tree.
  const files=page.getByRole('toolbar',{name:'View tools'}).getByRole('button',{name:'Open files'});
  if(await files.getAttribute('aria-pressed')!=='true')await files.click();
  const row=page.getByRole('tablist',{name:'Open shows'});
  for(const kind of ['Show','Scene']) await expect(row.getByRole('tab').filter({hasText:kind}).first()).toBeVisible();
  await expect(row.getByRole('tab').filter({hasText:/^Canvas/})).toHaveCount(0);
  await row.getByRole('tab').filter({hasText:'Scene'}).first().click();
  await expect(page.getByRole('button',{name:'Workspace: Scene',exact:true})).toBeVisible();
  // Narrow windows keep the page from scrolling sideways.
  for(const width of [1200,900]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
