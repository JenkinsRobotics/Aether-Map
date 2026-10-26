import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

// Media pool rows drag onto the workspace, not only onto timeline tracks.
test('dragging from the media pool onto the board and the scene adds it there',async({page,baseURL},info)=>{
  await page.setViewportSize({width:1600,height:1000});
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page,'Content');
  await page.getByRole('region',{name:'Map tools'}).getByRole('group',{name:'Add'}).getByRole('button',{name:'Text'}).click();
  const board=page.locator('.map-clip-board');
  await expect(board.locator('.map-text')).toHaveCount(1);
  await page.getByRole('toolbar',{name:'Aux toolbar'}).getByRole('button',{name:'Files'}).click();
  const pool=page.getByRole('region',{name:'Files navigation'}).getByRole('list',{name:'Media pool items'});
  const text=pool.getByRole('button',{name:/^Text/});
  await text.dragTo(page.getByLabel('Clip board'));
  await expect(board.locator('.map-text')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('board-drop.png')});
  await switchWorkspace(page,'Scene');
  const scene=page.getByRole('region',{name:'Scene preview'});
  const before=await scene.locator('.map-text').count();
  await text.dragTo(scene);
  await expect(scene.locator('.map-text')).toHaveCount(before+1);
  await page.screenshot({path:info.outputPath('scene-drop.png')});
});
