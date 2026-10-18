import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

test('native Loft orders sections, saves, edits and reopens',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  const headers={Origin:baseURL!};
  const document={format:'aether-part',formatVersion:3,documentId:'loft-browser',name:'Loft browser',units:'millimeter',features:[
    {id:'base',type:'profile',name:'Base section',suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'circle',radiusMillimeters:10,centerMillimeters:[0,0]}},
    {id:'top',type:'profile',name:'Top section',suppressed:false,plane:'XY',offsetMillimeters:20,profile:{type:'circle',radiusMillimeters:4,centerMillimeters:[0,0]}},
  ]};
  const created=await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Loft browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file=await created.json();
  const saved=async()=>{
    const result=await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    return JSON.parse(Buffer.from((await result.json()).data_base64,'base64').toString('utf8'));
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  await expect(page.getByText(/Opened Loft browser.acpart from your server/)).toBeVisible();
  await page.getByRole('button',{name:'Extrude variants',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Loft',exact:true}).click();
  const panel=page.locator('.cad-feature-dialog');
  await panel.getByLabel('Name',{exact:true}).fill('Transition');
  await panel.getByLabel('Section sketch',{exact:true}).selectOption('base');
  await panel.getByRole('button',{name:'Add section',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Apply and rebuild',exact:true})).toBeDisabled();
  await panel.getByLabel('Section sketch',{exact:true}).selectOption('top');
  await panel.getByRole('button',{name:'Add section',exact:true}).click();
  await expect(panel.getByLabel('Loft section order').locator('option')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('loft-editor.png')});
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.type).toBe('loft');
  const tree=page.getByRole('tree',{name:'CAD features',exact:true});
  await tree.getByText('Transition',{exact:true}).dblclick();
  await panel.getByLabel('Surface',{exact:true}).selectOption('ruled');
  await panel.getByLabel('Loft section order').selectOption('1');
  await panel.getByRole('button',{name:'Move up',exact:true}).click();
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async()=>(await saved()).features.at(-1)?.sections[0]?.profileFeatureId).toBe('top');
  await page.reload();
  await tree.getByText('Transition',{exact:true}).dblclick();
  await expect(panel.getByLabel('Surface',{exact:true})).toHaveValue('ruled');
  await expect(panel.getByLabel('Loft section order').locator('option').first()).toContainText('Top section');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:info.outputPath('loft-reopened.png')});
});
