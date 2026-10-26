import {expect,test} from '@playwright/test';
import {signIn,switchWorkspace} from './helpers';

// Moving a visual on a clip board keeps its proportions (it once stretched to
// the board's aspect from newSurface's square default frame).
test('moving and resizing a visual on the clip board keeps its proportions',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await switchWorkspace(page,'Content');
  await page.getByRole('region',{name:'Map tools'}).getByRole('group',{name:'Add'}).getByRole('button',{name:'Text'}).click();
  const text=page.locator('.map-clip-board .map-text').first();
  await expect(text).toBeVisible();
  const ratio=async()=>{const b=(await text.boundingBox())!;return b.width/b.height;};
  const before=await ratio();
  const box=(await page.getByLabel('Move visual').boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2-80,box.y+box.height/2+60,{steps:6});
  await page.mouse.up();
  await expect.poll(async()=>(await page.getByLabel('Move visual').boundingBox())!.x).toBeLessThan(box.x-40);
  expect(await ratio()).toBeCloseTo(before,1);
  await page.screenshot({path:info.outputPath('moved.png')});
  // A corner resizes from the opposite corner and keeps proportions, as surfaces do.
  const corner=(await page.getByLabel('Resize visual').nth(2).boundingBox())!;
  await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);
  await page.mouse.down();
  await page.mouse.move(corner.x-150,corner.y-20,{steps:6});
  await page.mouse.up();
  expect(await ratio()).toBeCloseTo(before,1);
  await page.screenshot({path:info.outputPath('resized.png')});
});
