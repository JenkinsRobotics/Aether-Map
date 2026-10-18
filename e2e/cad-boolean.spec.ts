import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

test('native Boolean consumes tools, edits to keep them, saves and reopens',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  const headers={Origin:baseURL!};
  const features=[];
  for(const [key,x] of [['target',0],['tool',5]] as const) features.push(
    {id:`${key}-sketch`,type:'profile',name:`${key} sketch`,suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'polygon',pointsMillimeters:[[x,0],[x+10,0],[x+10,10],[x,10]]}},
    {id:`${key}-pad`,type:'extrude',name:`${key} pad`,suppressed:false,profileFeatureId:`${key}-sketch`,distanceMillimeters:10,operation:'new',bodyId:key},
  );
  const document={format:'aether-part',formatVersion:3,documentId:'boolean-browser',name:'Boolean browser',units:'millimeter',features};
  const created=await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Boolean browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file=await created.json();
  const saved=async()=>{
    const result=await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    return JSON.parse(Buffer.from((await result.json()).data_base64,'base64').toString('utf8'));
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  await expect(page.getByText(/Opened Boolean browser.acpart from your server/)).toBeVisible();
  await page.getByRole('button',{name:'Boolean',exact:true}).click();
  const panel=page.locator('.cad-feature-dialog');
  await panel.getByLabel('Name',{exact:true}).fill('Combine');
  await panel.getByLabel('Target body',{exact:true}).selectOption('target');
  await panel.getByLabel('Use Body 2 as tool',{exact:true}).check();
  await page.screenshot({path:info.outputPath('boolean-editor.png')});
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.type).toBe('boolean');
  const bodies=page.getByRole('tree',{name:'CAD bodies',exact:true});
  await expect(bodies.getByRole('treeitem')).toHaveCount(1);
  const tree=page.getByRole('tree',{name:'CAD features',exact:true});
  await tree.getByText('Combine',{exact:true}).dblclick();
  await expect(panel.getByLabel('Use Body 2 as tool',{exact:true})).toBeChecked();
  await panel.getByLabel('Operation',{exact:true}).selectOption('cut');
  await panel.getByLabel('Keep tools',{exact:true}).selectOption('yes');
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.keepTools).toBe(true);
  await page.reload();
  await expect(bodies.getByRole('treeitem')).toHaveCount(2);
  await tree.getByText('Combine',{exact:true}).dblclick();
  await expect(panel.getByLabel('Operation',{exact:true})).toHaveValue('cut');
  await expect(panel.getByLabel('Keep tools',{exact:true})).toHaveValue('yes');
  await expect(panel.getByLabel('Target body',{exact:true})).toHaveValue('target');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:info.outputPath('boolean-reopened.png')});
});
