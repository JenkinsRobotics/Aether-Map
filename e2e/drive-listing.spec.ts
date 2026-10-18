import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('Drive sees app-created files without requiring an all-organizations server upgrade', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  const headers = { Origin: baseURL! };
  await page.request.post('/api/admin/apps',{headers,data:{id:'drive',enabled:true}});
  for (const [app,name] of [['cad','Existing part.acpart'],['map','Existing show.aethermap']]) {
    const response = await page.request.post('/api/library/create',{headers,data:{app,name,scope:'personal',data_base64:Buffer.from('{}').toString('base64')}});
    expect(response.ok(),await response.text()).toBe(true);
  }
  const orgResponse = await page.request.post('/api/drive/organization_create',{headers,data:{name:'Another team'}});
  const organization = (await orgResponse.json()).id;
  const extra = await page.request.post('/api/drive/create',{headers,data:{organization,name:'Other organization.txt',data_base64:Buffer.from('sample').toString('base64')}});
  expect(extra.ok(),await extra.text()).toBe(true);
  const requested: string[] = [];
  await page.route('**/api/drive/list',async route => {
    const body = route.request().postDataJSON();
    requested.push(body.organization);
    if (body.organization === 'all') return route.fulfill({status:403,json:{error:'You do not have permission in this organization.'}});
    await route.continue();
  });
  await page.goto('/drive/');
  const files = page.getByRole('table',{name:'Drive files'});
  await expect(files).toContainText('Existing part.acpart');
  await expect(files).toContainText('Existing show.aethermap');
  await page.getByRole('button',{name:'My files',exact:true}).click();
  for (const name of ['Existing part.acpart','Existing show.aethermap','Other organization.txt']) await expect(files).toContainText(name);
  expect(requested).toContain('default');
  expect(requested).toContain(organization);
  expect(requested).not.toContain('all');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Drive distinguishes a failed listing from an empty folder and can retry', async ({page,baseURL}) => {
  await signIn(page,baseURL!);
  const headers = { Origin: baseURL! };
  await page.request.post('/api/admin/apps',{headers,data:{id:'drive',enabled:true}});
  await page.request.post('/api/library/create',{headers,data:{app:'cad',name:'Retry part.acpart',scope:'personal',data_base64:Buffer.from('{}').toString('base64')}});
  let unavailable = true;
  await page.route('**/api/drive/list',async route => {
    if (unavailable) return route.fulfill({status:503,json:{error:'Temporarily unavailable.'}});
    await route.continue();
  });
  await page.goto('/drive/');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load files.');
  await expect(page.getByText('Your recent work will appear here',{exact:true})).toHaveCount(0);
  await expect(page.getByText('This location is empty',{exact:true})).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('table',{name:'Drive files'})).toContainText('Retry part.acpart');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
