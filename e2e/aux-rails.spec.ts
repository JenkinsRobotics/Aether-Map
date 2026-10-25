import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

// The left aux toolbar is the suite's (CAD): Comments, AI, Versions, Files,
// plus Map's Media pool; the dock toggles sit in the right-hand view tools (CAD).
test('left aux toolbar follows CAD, with Files and the Media pool',async({page,baseURL},info)=>{
  await page.setViewportSize({width:1600,height:1000});
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page,'Content');
  const aux=page.getByRole('toolbar',{name:'Aux toolbar'});
  const labels=await aux.getByRole('button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label')));
  expect(labels.filter(l=>!/Aether Agent|AI advisor/.test(l??''))).toEqual(['Comments','Version control','Files','Media pool']);
  const right=page.getByRole('toolbar',{name:'View tools'});
  for(const name of ['Open files','Mapped surfaces','Timeline']) await expect(right.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
  await aux.getByRole('button',{name:'Media pool'}).click();
  const pool=page.getByRole('region',{name:'Media pool'});
  await expect(pool.getByRole('list',{name:'Media pool items'}).getByRole('button',{name:/^Clip 1/})).toBeVisible();
  await pool.getByRole('list',{name:'Media pool items'}).click({button:'right',position:{x:40,y:200}});
  await expect(page.getByRole('menuitem',{name:/New bin/})).toBeVisible();
  await page.screenshot({path:info.outputPath('media-pool.png')});
  await page.keyboard.press('Escape');
  await pool.getByRole('button',{name:'Thumbnail view'}).click();
  await page.screenshot({path:info.outputPath('media-pool-thumbnails.png')});
  await aux.getByRole('button',{name:'Files'}).click();
  await expect(page.getByRole('region',{name:'Files'})).toBeVisible();
  await page.screenshot({path:info.outputPath('files.png')});
});
