import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

test('native polar Pattern saves and reopens source, count and axis edits',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  const headers={Origin:baseURL!};
  const document={format:'aether-part',formatVersion:3,documentId:'pattern-browser',name:'Pattern browser',units:'millimeter',features:[
    {id:'base',type:'profile',name:'Base',suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'circle',radiusMillimeters:10,centerMillimeters:[0,0]}},
    {id:'pad',type:'extrude',name:'Plate',suppressed:false,profileFeatureId:'base',distanceMillimeters:10,operation:'new',bodyId:'plate'},
    {id:'center',type:'profile',name:'Center',suppressed:false,plane:'XY',offsetMillimeters:10,profile:{type:'circle',radiusMillimeters:1,centerMillimeters:[5,0]}},
    {id:'hole',type:'hole',name:'Pilot hole',suppressed:false,profileFeatureId:'center',diameterMillimeters:2,depthMillimeters:10,depthType:'through-all',cutType:'plain',targetBodyId:'plate'},
  ]};
  const created=await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Pattern browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file=await created.json();
  const saved=async()=>{
    const result=await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    return JSON.parse(Buffer.from((await result.json()).data_base64,'base64').toString('utf8'));
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  await expect(page.getByText(/Opened Pattern browser.acpart from your server/)).toBeVisible();
  await page.getByRole('button',{name:'Pattern',exact:true}).click();
  const panel=page.locator('.cad-feature-dialog');
  await panel.getByLabel('Name',{exact:true}).fill('Bolt circle');
  await panel.getByLabel('Source feature',{exact:true}).selectOption('hole');
  await panel.getByLabel('Pattern type',{exact:true}).selectOption('polar');
  await panel.getByLabel('Axis',{exact:true}).selectOption('Z');
  await panel.getByLabel('Occurrences',{exact:true}).fill('4');
  await expect(panel.getByLabel('Spacing (mm)',{exact:true})).toHaveCount(1);
  await expect(panel.getByLabel('Spacing (mm)',{exact:true})).toBeHidden();
  await page.screenshot({path:info.outputPath('pattern-editor.png')});
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.type).toBe('pattern');
  const tree=page.getByRole('tree',{name:'CAD features',exact:true});
  await tree.getByText('Bolt circle',{exact:true}).dblclick();
  await panel.getByLabel('Occurrences',{exact:true}).fill('6');
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.count).toBe(6);
  await page.reload();
  await tree.getByText('Bolt circle',{exact:true}).dblclick();
  await expect(panel.getByLabel('Occurrences',{exact:true})).toHaveValue('6');
  await expect(panel.getByLabel('Source feature',{exact:true})).toHaveValue('hole');
  await expect(panel.getByLabel('Axis',{exact:true})).toHaveValue('Z');
  await expect(panel.getByLabel('Target body',{exact:true})).toHaveValue('plate');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:info.outputPath('pattern-reopened.png')});
});
