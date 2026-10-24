import {expect, test, type Page} from '@playwright/test';
import {signIn} from './helpers';

async function finishCreation(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {name:'Name', exact:true}).fill(name);
  await dialog.getByRole('button', {name:'Create', exact:true}).click();
  await expect(dialog).toBeHidden();
}
for (const [app, choice, extension] of [
  ['map','Show','aethermap'], ['cad','Part','acpart'], ['cad','Assembly','acasm'],
  ['cad','Project document','acad'], ['animation','Character','anima'],
]) test(`${app} ${choice} is saved and selected before the editor opens`, async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  await page.goto(`/${app}/`);
  await page.getByRole('button',{name:/Create/}).first().click();
  await page.getByRole('menuitem',{name:choice,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/${app}/$`));
  const name = `Saved ${choice}`;
  await finishCreation(page,name);
  await expect(page).toHaveURL(new RegExp(`/${app}/$`));
  const row=page.getByRole('table',{name:'Files',exact:true}).getByRole('row').filter({hasText:`${name}.${extension}`});
  await expect(row).toHaveAttribute('data-selected','true');
  const response=await page.request.post('/api/library/list',{headers:{Origin:baseURL!},data:{app,view:'personal',query:name}});
  const file=(await response.json()).files.find((file:{name:string})=>file.name===`${name}.${extension}`);
  expect(file).toBeTruthy(); expect(file.size).toBeGreaterThan(0);
  await row.dblclick();
  await expect(page).toHaveURL(new RegExp(`/${app}/index.html\\?document=${file.id}`));
});

test('Map folder creation stays in the directory and a failed save is retryable', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  const folder=await (await page.request.post('/api/library/create',{headers:{Origin:baseURL!},data:{app:'map',name:'Created shows',kind:'folder',scope:'personal'}})).json();
  await page.goto('/map/'); await page.getByRole('button',{name:'My files',exact:true}).click();
  await page.getByRole('button',{name:'Created shows',exact:false}).dblclick();
  await page.getByRole('button',{name:/Create/}).first().click();
  await page.getByRole('menuitem',{name:'Show',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'New show'});
  await expect(dialog).toContainText('Create in Created shows');
  await dialog.getByRole('textbox',{name:'Name'}).fill('Folder show');
  await page.route('**/api/library/create',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary save failure'})}),{times:1});
  await dialog.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Temporary save failure');
  await expect(dialog.getByRole('textbox',{name:'Name'})).toHaveValue('Folder show');
  await page.screenshot({path:info.outputPath('create-show-retry.png')});
  await dialog.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/map\/$/);
  const response=await page.request.post('/api/library/list',{headers:{Origin:baseURL!},data:{app:'map',view:'personal',parent:folder.id}});
  const files=(await response.json()).files;
  expect(files.filter((f:{name:string})=>f.name==='Folder show.aethermap')).toHaveLength(1);
  expect(files[0].parent).toBe(folder.id);
  await expect(page.getByRole('row').filter({hasText:'Folder show.aethermap'})).toHaveAttribute('data-selected','true');
  await page.screenshot({path:info.outputPath('created-show-in-folder.png')});
  await page.reload(); await page.getByRole('button',{name:'My files',exact:true}).click();
  await page.getByRole('button',{name:'Created shows',exact:false}).dblclick();
  await expect(page.getByRole('button',{name:'Folder show.aethermap',exact:false})).toBeVisible();
});

for (const [choice,app,extension] of [
  ['Part','cad','acpart'], ['Assembly','cad','acasm'], ['Map show','map','aethermap'],
  ['Sketch','sketch','aethersketch'], ['Character','animation','anima'], ['Circuit','io','aetherio'],
]) test(`Drive creates ${choice} in place using the app's file format`, async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  for (const id of ['drive',app]) await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id,enabled:true}});
  await page.goto('/drive/');
  await page.getByRole('button',{name:'Create or upload',exact:true}).click();
  await page.getByRole('menuitem',{name:choice,exact:true}).click();
  const name=`Drive ${choice}`;
  await finishCreation(page,name);
  await expect(page).toHaveURL(/\/drive\/$/);
  await expect(page.getByRole('row').filter({hasText:`${name}.${extension}`})).toHaveAttribute('data-selected','true');
  const listing=await page.request.post('/api/drive/list',{headers:{Origin:baseURL!},data:{view:'personal',query:name}});
  const created=(await listing.json()).files.find((f:{name:string})=>f.name===`${name}.${extension}`);
  expect(created.app).toBe(app);expect(created.size).toBeGreaterThan(0);
  const read=await page.request.post('/api/library/read',{headers:{Origin:baseURL!},data:{app,id:created.id}});
  expect(read.ok()).toBe(true);
  const content=Buffer.from((await read.json()).data_base64,'base64').toString();
  if (app==='map') expect(JSON.parse(content).scenes).toHaveLength(1);
  if (app==='sketch') expect(JSON.parse(content).format).toBe('aethersketch');
  if (app==='io') expect(JSON.parse(content).parts).toEqual([]);
  if (app==='animation') {
    const parsed=await page.request.post('/animation/rpc',{headers:{Origin:baseURL!},data:{id:1,method:'load_character',params:{text:content}}});
    expect((await parsed.json()).ok).toBe(true);
  }
});

test('IO creates a circuit in My files and opens it only on double-click', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'io',enabled:true}});
  await page.goto('/io/');
  await page.getByRole('button',{name:'Create new',exact:true}).click();
  await finishCreation(page,'Circuit in directory');
  await expect(page.locator('.io-document-bar')).toHaveCount(0);
  const row=page.getByRole('table',{name:'Circuit files'}).getByRole('row').filter({hasText:'Circuit in directory.aetherio'});
  await expect(row).toHaveAttribute('data-selected','true');
  const list=await page.request.post('/api/library/list',{headers:{Origin:baseURL!},data:{app:'io',view:'personal',query:'Circuit in directory'}});
  const file=(await list.json()).files[0]; expect(file.size).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('created-circuit-in-directory.png')});
  await row.getByRole('button',{name:'Circuit in directory.aetherio',exact:false}).dblclick();
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`document=${file.id}`));
});

test('IO recognizes shared library folders and creates inside the open folder', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'io',enabled:true}});
  const folder=await (await page.request.post('/api/library/create',{headers:{Origin:baseURL!},data:{app:'io',name:'Circuit directory',kind:'folder',scope:'personal'}})).json();
  await page.goto('/io/');
  const table=page.getByRole('table',{name:'Circuit files'});
  await expect(table.getByRole('row').filter({hasText:'Circuit directory'}).locator('[data-icon="file-folder"]')).toHaveCount(1);
  await table.getByRole('button',{name:'Circuit directory',exact:false}).dblclick();
  await page.getByRole('button',{name:'Create new',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Create in Circuit directory');
  await finishCreation(page,'Nested circuit');
  await expect(table.getByRole('row').filter({hasText:'Nested circuit.aetherio'})).toHaveAttribute('data-selected','true');
  const result=await page.request.post('/api/library/list',{headers:{Origin:baseURL!},data:{app:'io',view:'personal',parent:folder.id}});
  const files=(await result.json()).files;
  expect(files).toHaveLength(1); expect(files[0].parent).toBe(folder.id);
});
