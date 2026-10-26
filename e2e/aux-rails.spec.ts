import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

// The left aux toolbar is the suite's standard (CAD): Comments, AI, Versions, Files.
// Map's own panels (Media pool) and the dock toggles sit on the right (CAD).
test('left aux toolbar is the standard four; the Media pool is on the right',async({page,baseURL},info)=>{
  await page.setViewportSize({width:1600,height:1000});
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page,'Content');
  const aux=page.getByRole('toolbar',{name:'Aux toolbar'});
  const labels=await aux.getByRole('button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label')));
  expect(labels).toEqual(['Comments','AI advisor','Version control','Files']);
  const right=page.getByRole('toolbar',{name:'View tools'});
  for(const name of ['Open files','Mapped surfaces','Timeline']) await expect(right.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
  await page.getByRole('toolbar',{name:'Right sidebar tabs'}).getByRole('button',{name:'Media pool'}).click();
  const pool=page.getByRole('region',{name:'Media pool'});
  await expect(pool.getByRole('list',{name:'Media pool items'}).getByRole('button',{name:/^Clip 1/})).toBeVisible();
  const items=pool.getByRole('list',{name:'Media pool items'}), box=(await items.boundingBox())!;
  await items.click({button:'right',position:{x:20,y:box.height-6}});
  await expect(page.getByRole('menuitem',{name:/New bin/})).toBeVisible();
  await page.screenshot({path:info.outputPath('media-pool.png')});
  await page.keyboard.press('Escape');
  await pool.getByRole('button',{name:'Thumbnail view'}).click();
  await page.screenshot({path:info.outputPath('media-pool-thumbnails.png')});
  await page.getByRole('radiogroup',{name:'Media tabs'}).getByRole('radio',{name:/Browse/}).click();
  await expect(page.getByRole('searchbox',{name:'Search Pixabay or paste a link'})).toBeVisible();
  await page.screenshot({path:info.outputPath('media-browse.png')});
  await aux.getByRole('button',{name:'Files'}).click();
  await expect(page.getByRole('region',{name:'Files navigation'})).toBeVisible();
  const filesView=page.getByRole('radiogroup',{name:'Files view'});
  await expect(filesView.getByRole('radio')).toHaveText(['This show','Drive']);
  await expect(filesView).toHaveClass(/aui-segmented-control--panel/);
  await page.screenshot({path:info.outputPath('files.png')});
  await filesView.getByRole('radio',{name:/Drive/}).click();
  await expect(page.getByRole('region',{name:'Drive files'})).toBeVisible();
  await page.screenshot({path:info.outputPath('files-drive.png')});
  // The agent is CAD's: no sharing banner, and its composer stays inside the sidebar.
  await aux.getByRole('button',{name:'AI advisor'}).click();
  const agent=page.getByRole('region',{name:'Projection assistant'});
  await expect(agent.getByRole('button',{name:'Agent connections'})).toBeVisible();
  await expect(agent.getByRole('button',{name:/Share this editor/})).toHaveCount(0);
  const [panel,side]=await Promise.all([agent.boundingBox(),page.locator('.aui-studio-aux-sidebar').boundingBox()]);
  expect(panel!.y+panel!.height).toBeLessThanOrEqual(side!.y+side!.height+1);
  await page.screenshot({path:info.outputPath('agent.png')});
});
