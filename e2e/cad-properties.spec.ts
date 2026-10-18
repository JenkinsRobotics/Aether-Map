import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

test('exact physical properties use explicit density without changing the file',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  const headers={Origin:baseURL!};
  const document={format:'aether-part',formatVersion:3,documentId:'properties-browser',name:'Properties browser',units:'millimeter',features:[
    {id:'s',type:'profile',name:'Base',suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'polygon',pointsMillimeters:[[0,0],[10,0],[10,20],[0,20]]}},
    {id:'pad',type:'extrude',name:'Block',suppressed:false,profileFeatureId:'s',distanceMillimeters:30,operation:'new',bodyId:'block'},
  ]};
  const created=await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Properties browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file=await created.json();
  const saved=async()=>{
    const result=await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    return (await result.json()).data_base64;
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  await expect(page.getByText(/Opened Properties browser.acpart from your server/)).toBeVisible();
  const before=await saved();
  await page.getByRole('button',{name:'Physical properties',exact:true}).click();
  const panel=page.locator('.cad-analysis-dialog');
  const table=panel.getByRole('table',{name:'Body 1 physical properties'});
  await expect(table.getByRole('rowheader',{name:'Volume (mm³)',exact:true}).locator('..')).toContainText('6000');
  await expect(table.getByRole('rowheader',{name:'Surface area (mm²)',exact:true}).locator('..')).toContainText('2200');
  await expect(table.getByRole('rowheader',{name:'Mass (kg)',exact:true})).toHaveCount(0);
  await panel.getByLabel('Density (kg/m³)',{exact:true}).fill('7850');
  await panel.getByLabel('Density (kg/m³)',{exact:true}).press('Tab');
  await expect(table.getByRole('rowheader',{name:'Mass (kg)',exact:true}).locator('..')).toContainText('0.0471');
  await expect(table.getByRole('rowheader',{name:'Center of mass (mm)',exact:true}).locator('..')).toContainText('5, 10, 15');
  await page.screenshot({path:info.outputPath('physical-properties.png')});
  await panel.getByRole('button',{name:'Close',exact:true}).click();
  await expect(panel).toHaveCount(0);
  expect(await saved()).toBe(before);
});
