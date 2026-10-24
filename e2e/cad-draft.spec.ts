import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

test('native Draft saves face references and edits/reopens its angle',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  const headers={Origin:baseURL!};
  const document={format:'aether-part',formatVersion:3,documentId:'draft-browser',name:'Draft browser',units:'millimeter',features:[
    {id:'outline',type:'profile',name:'Outline',suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'polygon',pointsMillimeters:[[0,0],[20,0],[20,20],[0,20]]}},
    {id:'pad',type:'extrude',name:'Plate',suppressed:false,profileFeatureId:'outline',distanceMillimeters:10,operation:'new',bodyId:'plate'},
  ]};
  const created=await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Draft browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file=await created.json();
  const saved=async()=>{
    const result=await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    return JSON.parse(Buffer.from((await result.json()).data_base64,'base64').toString('utf8'));
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  await expect(page.getByText(/Opened Draft browser.acpart from your server/)).toBeVisible();
  await page.getByRole('button',{name:'Draft',exact:true}).click();
  const panel=page.locator('.cad-feature-dialog');
  await panel.getByLabel('Name',{exact:true}).fill('Wall draft');
  await panel.getByLabel('Face plane offset (mm)',{exact:true}).fill('20');
  await page.screenshot({path:info.outputPath('draft-editor.png')});
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.type).toBe('draft');
  const tree=page.getByRole('tree',{name:'CAD features',exact:true});
  await tree.getByText('Wall draft',{exact:true}).dblclick();
  await panel.getByLabel('Draft angle (deg)',{exact:true}).fill('8');
  await panel.getByLabel('Direction',{exact:true}).selectOption('reverse');
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.angleDegrees).toBe(8);
  await page.reload();
  await tree.getByText('Wall draft',{exact:true}).dblclick();
  await expect(panel.getByLabel('Face plane offset (mm)',{exact:true})).toHaveValue('20.000');
  await expect(panel.getByLabel('Draft angle (deg)',{exact:true})).toHaveValue('8.000');
  await expect(panel.getByLabel('Direction',{exact:true})).toHaveValue('reverse');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:info.outputPath('draft-reopened.png')});
});
