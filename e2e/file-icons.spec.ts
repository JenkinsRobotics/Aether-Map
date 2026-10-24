import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('file artwork keeps official branding and independent light/dark gradients', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'ui',enabled:true}});
  await page.goto('/ui/#tab=icons');
  const colors: Record<string, string>[] = [];
  const apps: Record<string, string> = {part:'cad',assembly:'cad',project:'cad',drawing:'cad',show:'map',character:'animation',clip:'animation',workspace:'studio',sketch:'sketch',circuit:'io',vector:'vector'};
  for (const mode of ['light','dark']) {
    const preview = page.locator(`[data-file-icon-preview="${mode}"]`);
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    const types = await preview.locator('[data-file-type]').evaluateAll(elements => [...new Set(elements.map(element => element.getAttribute('data-file-type')!))]);
    expect(types).toHaveLength(24);
    const palette: Record<string, string> = {};
    for (const type of types) {
      const icons = preview.locator(`[data-file-type="${type}"]`);
      await expect(icons).toHaveCount(4);
      const image = icons.first().locator('img');
      if (apps[type]) {
        await expect(image).toHaveAttribute('src', new RegExp(`/icons/${apps[type]}\\.png\\?v=`));
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      } else await expect(image).toHaveCount(0);
      await expect(icons.first().locator('svg')).toHaveAttribute('data-file-artwork',type);
      palette[type] = await icons.first().locator('linearGradient stop').first().evaluate(stop => getComputedStyle(stop).stopColor);
      // The gallery lives inside a scroll container. Capture each complete tile
      // rather than a tall panel whose offscreen portions are clipped by it.
      const tile = icons.first().locator('..');
      await tile.scrollIntoViewIfNeeded();
      await tile.screenshot({path:info.outputPath(`file-icon-${mode}-${type}.png`),animations:'disabled'});
    }
    colors.push(palette);
  }
  // Folders retain their recognizable gold material; every document page adapts.
  for (const type of Object.keys(colors[0]).filter(type => type !== 'folder')) expect(colors[0][type], type).not.toBe(colors[1][type]);
  const ids = await page.locator('[data-file-icon-preview] svg [id]').evaluateAll(elements => elements.map(element => element.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('file identities stay consistent across Drive, filters, cards, details and CAD home', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'drive',enabled:true}});
  const fixtures = [
    ['Icon wheel.acpart','cad','file-part'],
    ['Icon train.acasm','cad','file-assembly'],
    ['Icon drawing.acdrw','cad','file-drawing'],
    ['Icon project.acad','cad','file-project'],
    ['Icon show.aethermap','map','file-show'],
    ['Icon robot.anima','animation','file-character'],
    ['Icon sketch.aethersketch','drive','file-sketch'],
    ['Icon circuit.aetherio','drive','file-circuit'],
    ['Icon instructions.docx','drive','file-word'],
    ['Icon BOM.xlsx','drive','file-spreadsheet'],
    ['Icon review.pptx','drive','file-presentation'],
    ['Icon reference.pdf','drive','file-pdf'],
    ['Icon picture.png','drive','file-image'],
    ['Icon playback.mp4','drive','file-video'],
    ['Icon voice.wav','drive','file-audio'],
    ['Icon backup.zip','drive','file-archive'],
    ['Icon notes.txt','drive','file-text'],
  ];
  // File-list fixtures: no editor is opened with the placeholder content.
  for (const [name,app] of fixtures) {
    const created=await page.request.post('/api/library/create',{headers:{Origin:baseURL!},data:{app,name,scope:'personal',data_base64:Buffer.from('{}').toString('base64')}});
    expect(created.ok(),await created.text()).toBe(true);
  }
  await page.goto('/drive/');
  await expect(page.getByRole('heading',{name:'Recent',exact:true})).toBeVisible();
  const table=page.getByRole('table',{name:'Drive files'});
  for (const [name,,icon] of fixtures) await expect(table.getByRole('row').filter({hasText:name}).locator(`[data-icon="${icon}"]`)).toHaveCount(1);
  for (const [name, app] of [['Icon wheel.acpart', 'cad'], ['Icon show.aethermap', 'map'], ['Icon robot.anima', 'animation'], ['Icon circuit.aetherio', 'io']]) {
    const icon = table.getByRole('row').filter({hasText: name}).locator(`[data-file-app="${app}"]`);
    await expect(icon.locator('img')).toHaveAttribute('src', new RegExp(`/icons/${app}.png`));
    await expect.poll(() => icon.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('button',{name:'Parts',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Icon wheel.acpart');
  await page.getByRole('button',{name:'More file types',exact:true}).click();
  await expect(page.getByRole('menuitemradio',{name:'Spreadsheets'}).locator('[data-icon="file-spreadsheet"]')).toHaveCount(1);
  await expect(page.locator('[data-icon-missing]')).toHaveCount(0);
  await page.getByRole('menuitemradio',{name:'Spreadsheets'}).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Icon BOM.xlsx');
  await page.getByRole('button',{name:'All',exact:true}).click();
  await page.getByRole('button',{name:'My files',exact:true}).click();
  await page.getByRole('textbox',{name:'Search Drive'}).fill('Icon ');
  await table.getByRole('button',{name:'Icon train.acasm',exact:true}).click();
  await page.getByRole('button',{name:'Details',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'File details'}).locator('[data-icon="file-assembly"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Details',exact:true}).click();
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Dark',exact:true}).click();
  await page.screenshot({path:info.outputPath('drive-file-identities.png'),animations:'disabled'});
  await page.getByRole('button',{name:'File view',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Grid view',exact:true}).click();
  for (const [name,,icon] of fixtures) await expect(page.locator('.drive-file-row').filter({hasText:name}).locator(`[data-icon="${icon}"]`)).toHaveCount(1);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('textbox',{name:'Filter by name or person'}).fill('Icon ');
  await page.setViewportSize({width:600,height:850});
  await page.getByRole('button',{name:'More file types',exact:true}).click();
  const menu=page.getByRole('menu',{name:'More file types',exact:true});
  const bounds=await menu.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(420);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(850);
  await page.getByRole('menuitemradio',{name:'Text documents'}).click();
  await expect(page.locator('.drive-file-row')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('drive-file-identities-narrow.png'),animations:'disabled'});
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/cad/');
  await page.getByRole('button',{name:'My files',exact:true}).click();
  const cad=page.getByRole('table',{name:'Files',exact:true});
  for (const [name,app,icon] of fixtures.filter(f=>f[1]==='cad')) {
    expect(app).toBe('cad');
    await expect(cad.getByRole('row').filter({hasText:name}).locator(`[data-icon="${icon}"]`)).toHaveCount(1);
  }
});
