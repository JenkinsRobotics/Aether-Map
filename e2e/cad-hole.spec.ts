import {expect, test} from '@playwright/test';
import {signIn} from './helpers';

test('native Hole can be authored, edited and reopened with its target and parameters', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  const headers = {Origin:baseURL!};
  const document = {format:'aether-part',formatVersion:3,documentId:'hole-browser',name:'Hole browser',units:'millimeter',features:[
    {id:'outline',type:'profile',name:'Outline',suppressed:false,plane:'XY',offsetMillimeters:0,profile:{type:'circle',radiusMillimeters:10,centerMillimeters:[0,0]}},
    {id:'pad',type:'extrude',name:'Plate',suppressed:false,profileFeatureId:'outline',distanceMillimeters:10,operation:'new',bodyId:'plate'},
    {id:'center',type:'profile',name:'Center',suppressed:false,plane:'XY',offsetMillimeters:10,profile:{type:'circle',radiusMillimeters:1,centerMillimeters:[0,0]}},
  ]};
  const created = await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Hole browser.acpart',kind:'file',scope:'personal',data_base64:Buffer.from(JSON.stringify(document)).toString('base64')}});
  expect(created.ok()).toBe(true);
  const file = await created.json();
  const saved = async () => {
    const response = await page.request.post('/api/library/read',{headers,data:{app:'cad',id:file.id}});
    const current = await response.json();
    return JSON.parse(Buffer.from(current.data_base64,'base64').toString('utf8'));
  };
  await page.goto(`/cad/index.html?document=${file.id}`);
  const tree = page.getByRole('tree',{name:'CAD features',exact:true});
  await expect(tree.getByText('Plate',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Hole',exact:true}).click();
  const panel = page.locator('.cad-feature-dialog');
  await panel.getByLabel('Center sketch',{exact:true}).selectOption('center');
  await panel.getByLabel('Name',{exact:true}).fill('Mounting hole');
  await panel.getByLabel('Hole type',{exact:true}).selectOption('counterbore');
  await panel.getByLabel('Depth (mm)',{exact:true}).fill('8');
  await expect(panel.getByLabel('Countersink angle (deg)',{exact:true})).toHaveCount(1);
  await expect(panel.getByLabel('Countersink angle (deg)',{exact:true})).toBeHidden();
  await page.screenshot({path:info.outputPath('hole-counterbore-editor.png')});
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async () => (await saved()).features.at(-1)?.type).toBe('hole');
  await tree.getByText('Mounting hole',{exact:true}).dblclick();
  await expect(panel.getByLabel('Hole type',{exact:true})).toHaveValue('counterbore');
  await panel.getByLabel('Hole type',{exact:true}).selectOption('plain');
  await panel.getByLabel('Depth type',{exact:true}).selectOption('through-all');
  await panel.getByLabel('Diameter (mm)',{exact:true}).fill('8');
  await panel.getByRole('button',{name:'Apply and rebuild',exact:true}).click();
  await expect(panel).toBeHidden();
  await expect.poll(async () => (await saved()).features.at(-1)?.diameterMillimeters).toBe(8);
  await page.reload();
  await tree.getByText('Mounting hole',{exact:true}).dblclick();
  await expect(panel.getByLabel('Diameter (mm)',{exact:true})).toHaveValue('8.000');
  await expect(panel.getByLabel('Depth type',{exact:true})).toHaveValue('through-all');
  await expect(panel.getByLabel('Target body',{exact:true})).toHaveValue('plate');
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:info.outputPath('hole-reopened.png')});
});
