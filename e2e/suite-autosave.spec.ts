import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('Animation automatically saves a mate edit and restores it on refresh', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  // Untimed rig: deleting a mate used by an existing clip/output is correctly rejected by the engine.
  const source = await page.request.get('/animation/workspace/examples/pan_tilt_head.character.anima');
  const fixture = (await source.text()).split('\nclips:')[0];
  const seeded=await page.request.post('/api/library/create',{headers:{Origin:baseURL!},data:{app:'animation',name:'Autosave.character.anima',data_base64:Buffer.from(fixture).toString('base64')}});
  expect(seeded.ok()).toBe(true);
  const file=await seeded.json();
  const read=async()=>{const result=await page.request.post('/api/library/read',{headers:{Origin:baseURL!},data:{app:'animation',id:file.id}});return result.json();};
  await page.goto(`/animation/index.html?document=${file.id}`);
  await page.getByRole('button', { name: 'Mates', exact: true }).click();
  const row = page.getByRole('treeitem').filter({ hasText: /revolute/ }).first();
  await expect(row).toBeVisible(); const name = (await row.innerText()).split(' · ')[0].trim();
  const original=(await read()).data_base64;
  await row.click(); await page.getByRole('button', { name: 'Remove mate', exact: true }).click();
  await expect(page.getByRole('treeitem').filter({ hasText: `${name} ·` })).toHaveCount(0);
  await page.reload();
  const matesButton = page.getByRole('button', { name: 'Mates', exact: true });
  await expect(matesButton).toBeVisible();
  if (await matesButton.getAttribute('aria-pressed') !== 'true') await matesButton.click();
  await expect(page.getByRole('treeitem').filter({ hasText: 'tilt ·' })).toBeVisible();
  await expect(page.getByRole('treeitem').filter({ hasText: `${name} ·` })).toHaveCount(0);
  await expect.poll(async () => (await read()).data_base64).not.toBe(original);
  expect((await read()).revision).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('animation-autosave.png') });
});

test('CAD protects a feature-tree edit before refresh and automatically persists it', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/cad/index.html?new=part');
  const creation = page.getByRole('dialog', { name: 'New Part workspace' });
  await creation.getByRole('textbox', { name: 'Workspace name' }).fill('Autosave Part');
  await creation.getByRole('button', { name: 'Create Part', exact: true }).click();
  await expect(page).toHaveURL(/document=/);
  const id = new URL(page.url()).searchParams.get('document')!;
  page.once('dialog', dialog => dialog.accept('Recovered folder'));
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await expect(page.getByRole('treeitem').filter({ hasText: 'Recovered folder' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('treeitem').filter({ hasText: 'Recovered folder' })).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL! }, data: { app: 'cad', id } });
    const file = await response.json(); return Buffer.from(file.data_base64, 'base64').toString();
  }).toContain('Recovered folder');
  await page.screenshot({ path: info.outputPath('cad-autosave.png') });
});

test('a new CAD Assembly saves automatically and reopens as a canonical workspace', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/cad/index.html?new=part');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('assembly');
  await dialog.getByRole('textbox', { name: 'Workspace name' }).fill('Autosaved Assembly');
  await dialog.getByRole('button', { name: 'Create Assembly', exact: true }).click();
  await expect(page).toHaveURL(/document=/);
  await page.reload();
  await expect(page.locator('#document-name')).toContainText('Autosaved Assembly');
});
