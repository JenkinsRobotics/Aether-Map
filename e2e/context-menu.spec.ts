import { expect, test } from '@playwright/test';
import { emptyShow } from '../src/document';
import { addPoolAsset, normalizeMediaPool, placePoolAsset } from '../src/media-pool';
import { signIn, switchWorkspace, openBottomDock, openAppSettings } from './helpers';

test('Aether menus replace native menus, scope zoom, keep clip actions, clipboard and field editing', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  let show = normalizeMediaPool(emptyShow());
  show = addPoolAsset(show, { mediaId:null, rect:[0,0,1920,1080], fill:'#fe9040' }, 'Orange');
  show = placePoolAsset(show, show.pool![0].id, show.tracks![0].id, 0);
  const result = await page.request.post('/api/library/create', {headers:{Origin:baseURL!},data:{app:'map',scope:'personal',name:'Context menus.aethermap',data_base64:Buffer.from(JSON.stringify(show)).toString('base64')}});
  expect(result.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await result.json()).id}`);
  await switchWorkspace(page,'Visualization'); await openBottomDock(page,'Timeline');
  const timeline = page.getByRole('region',{name:'Main timeline',exact:true});
  const ruler = timeline.locator('.map-ruler');
  const originalWidth = (await ruler.boundingBox())!.width;
  await ruler.click({button:'right',position:{x:80,y:10}});
  await expect(page.getByRole('menu',{name:'Aether commands'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Zoom in',exact:true}).click();
  await expect.poll(async () => (await ruler.boundingBox())!.width).toBeGreaterThan(originalWidth*1.4);
  await ruler.hover();
  await page.keyboard.down('Control'); await page.mouse.wheel(0,-100); await page.keyboard.up('Control');
  await expect.poll(async () => (await ruler.boundingBox())!.width).toBeGreaterThan(originalWidth*1.8);
  await timeline.locator('.map-clip').first().click({button:'right'});
  const object = page.getByRole('menu',{name:'Timeline actions'});
  await expect(object.getByRole('menuitem',{name:'Copy clip',exact:true})).toBeVisible();
  await expect(object.getByRole('menuitem',{name:/Undo/})).toHaveCount(1);
  await expect(object.getByRole('separator')).not.toHaveCount(0);
  await page.screenshot({path:info.outputPath('clip-context-menu.png')});
  await object.getByRole('menuitem',{name:'Copy clip',exact:true}).click();
  await timeline.getByRole('combobox',{name:'Timeline mode'}).selectOption('advanced');
  await timeline.getByLabel('V1 clips').click({button:'right',position:{x:450,y:60}});
  await page.getByRole('menuitem',{name:'Paste at playhead',exact:true}).click();
  await expect(timeline.locator('.map-clip')).toHaveCount(2);
  await timeline.locator('.map-clip').last().click({button:'right'});
  await page.getByRole('menuitem',{name:/^Undo/}).click();
  await expect(timeline.locator('.map-clip')).toHaveCount(1);
  // The canvas has its own zoom; changing it must not change the timeline scale.
  const canvas = page.getByLabel('Mapping canvas', {exact:true});
  const widthBefore = (await ruler.boundingBox())!.width;
  const scaleBefore = await canvas.locator('.map-zoom-value').innerText();
  await canvas.click({button:'right',position:{x:40,y:40}});
  await page.getByRole('menuitem',{name:'Zoom in',exact:true}).click();
  await expect(canvas.locator('.map-zoom-value')).not.toHaveText(scaleBefore);
  expect((await ruler.boundingBox())!.width).toBeCloseTo(widthBefore,0);
  const search = page.getByRole('textbox',{name:'Search media pool'});
  await search.fill('Orange'); await search.click({button:'right'});
  await expect(page.getByRole('menuitem',{name:/Select all/})).toBeVisible();
  await expect(page.getByRole('menuitem',{name:'Delete clip',exact:true})).toHaveCount(0);
  await page.getByRole('menuitem',{name:/Select all/}).click();
  await expect.poll(() => search.evaluate((el:HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe(6);
  await search.press('Shift+F10');
  await expect(page.getByRole('menu',{name:'Aether commands'})).toBeVisible();
  await page.keyboard.press('Escape');
  // The cancelable native event is intercepted even on empty chrome.
  expect(await page.getByRole('complementary',{name:'Aether Map sidebar',exact:true}).evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:20})))).toBe(false);
  await expect(page.getByRole('menuitem',{name:'Aether Map settings'})).toBeVisible();
  await page.keyboard.press('Escape');
  await openAppSettings(page);
  const settings = page.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await settings.getByRole('button',{name:/Close/}).click();
  await timeline.locator('.map-clip').first().click({button:'right'});
  await page.screenshot({path:info.outputPath('clip-context-menu-dark.png')});
});

for (const app of ['sketch','io','cad','animation']) {
  test(`${app} inherits the Aether context menu`, async ({page,baseURL}) => {
    await signIn(page,baseURL!); await page.goto('/');
    const id = await page.evaluate(async app => {
      const {createDocument} = await import(`/${app}/create-document.js`);
      const file:File = await createDocument('Context menu',false);
      const data = await new Promise<string>(resolve => {const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
      const response = await fetch('/api/library/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app,name:file.name,scope:'personal',data_base64:data})});
      if (!response.ok) throw new Error(await response.text()); return (await response.json()).id;
    },app);
    await page.goto(`/${app}/index.html?document=${id}`);
    const header = page.locator('.aui-document-bar').first(); await expect(header).toBeVisible();
    expect(await header.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:450,clientY:30})))).toBe(false);
    const menu = page.getByRole('menu',{name:'Aether commands'}); await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem',{name:/settings$/})).toHaveCount(1);
    await expect(menu.getByRole('menuitem',{name:app === 'animation' ? 'Fit view' : app === 'cad' ? 'Undo sketch' : /^Undo/})).toHaveCount(1);
    await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    if (app === 'cad' || app === 'animation') {
      // Exclude the small navigation cube; exercise the actual renderer canvas.
      const canvases = page.locator('canvas:visible');
      const index = await canvases.evaluateAll(elements => elements.reduce((largest, el, i) =>
        el.getBoundingClientRect().width > elements[largest].getBoundingClientRect().width ? i : largest, 0));
      const canvas = canvases.nth(index);
      await expect(canvas).toBeVisible();
      await canvas.click({button:'right'});
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem',{name:'Fit view',exact:true})).toBeVisible();
    }
  });
}
