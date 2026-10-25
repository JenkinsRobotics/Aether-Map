import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace,clickRibbon,saveShow} from './helpers';

// Content builds a clip with no surfaces; Scene says which surfaces play it.
test('build a clip in Content and play it on two surfaces',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await clickRibbon(page,'Cube');
  await expect(page.locator('.map-surface')).toHaveCount(3);
  // Content: the first clip opens on its own board; a colour goes into it.
  await switchWorkspace(page,'Content');
  await expect(page.getByLabel('Clip board')).toBeVisible();
  await expect(page.getByText(/^Clip 1 · \d+ × \d+$/)).toBeVisible();
  await page.getByRole('region',{name:'Map tools'}).getByRole('group',{name:'Add'}).getByRole('button',{name:'Colour'}).click();
  await expect(page.locator('.map-clip-board .map-surface')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('content.png')});
  // Scene: pick the clip in the Media pool, then two cube faces in the surface row.
  await switchWorkspace(page,'Scene');
  await page.getByRole('toolbar',{name:'Aux toolbar'}).getByRole('button',{name:'Media pool'}).click();
  const pool=page.getByRole('list',{name:'Media pool items'});
  await pool.getByRole('button',{name:/^Clip 1/}).click();
  const faces=page.getByRole('group',{name:'Asset surface assignments'}).getByRole('button',{name:/^Assign to (?!entire)/});
  await faces.nth(0).click(); await faces.nth(1).click();
  await expect(pool.getByRole('button',{name:/^Clip 1/})).toContainText('2 uses');
  await expect(page.getByRole('region',{name:'Scene preview'}).locator('.map-surface')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('scene.png')});
  // Content reports where the clip plays; it survives a save and reload.
  await switchWorkspace(page,'Content');
  await expect(page.getByText('Used on 2 surfaces.')).toBeVisible();
  // The document menu lives on the file row, which Mapping's dock shows.
  await switchWorkspace(page,'Mapping');
  await saveShow(page,'Content workspace e2e');
  await page.reload();
  await switchWorkspace(page,'Content');
  await expect(page.getByText('Used on 2 surfaces.')).toBeVisible();
  await expect(page.locator('.map-clip-board .map-surface')).toHaveCount(1);
});
