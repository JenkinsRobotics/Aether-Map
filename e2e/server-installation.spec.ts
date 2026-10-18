import { test, expect } from '@playwright/test';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signIn } from './helpers';

test('server backup settings persist and deliver an archive', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'studio-backup-delivery-')));
  try {
    await page.goto('/?workspace=admin&section=backups');
    await expect(page.getByRole('heading', { name: 'Server storage and backup delivery' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Automatic backups', exact: true }).selectOption('12');
    await page.getByLabel('Backup destination on server', { exact: true }).fill(folder);
    await page.getByRole('button', { name: 'Save backup settings' }).click();
    await expect(page.locator('.messages')).toContainText('Backup settings saved.');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Automatic backups', exact: true })).toHaveValue('12');
    await expect(page.getByLabel('Backup destination on server', { exact: true })).toHaveValue(folder);
    await page.getByRole('button', { name: 'Create backup', exact: true }).click();
    await expect(page.getByText(/^Delivered: studio-/)).toBeVisible();
    const files = await readdir(folder);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.zip$/);
    await page.screenshot({ path: info.outputPath('server-backups.png'), fullPage: true });
    const status = await page.request.get('/api/status');
    expect(JSON.stringify(await status.json())).not.toContain(folder);
    await page.goto('/?workspace=admin');
    await expect(page.getByRole('heading', { name: 'Team server', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Set up team access', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connect your on-site team' })).toBeVisible();
    await expect(page.locator('[data-icon-missing]')).toHaveCount(0);
  } finally {
    await page.request.post('/api/admin/storage', { headers: { Origin: baseURL! }, data: { interval_hours: 24, export_directory: '' } }).catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});
