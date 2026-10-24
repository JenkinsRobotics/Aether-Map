import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('administrators land in personal Studio and deliberately switch to administration', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const adminRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/admin/')) adminRequests.push(request.url()); });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Studio navigation' });
  await expect(page.getByRole('heading', { name: 'Your workspace, together.' })).toBeVisible();
  await expect(nav.getByRole('button')).toHaveText(['Home', 'Plugins', 'Applications', 'My account']);
  await expect(page.getByText('Active users', { exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('button', { name: /^(Enable|Disable)$/ })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Plugins', exact: true }).click();
  await expect(page.getByText('Personal account sign-in', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toHaveCount(0);
  expect(adminRequests).toEqual([]);
  await nav.getByRole('button', { name: 'Home', exact: true }).click();
  await page.screenshot({ path: info.outputPath('personal-workspace.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open administration', exact: true }).click();
  await expect(page).toHaveURL(/workspace=admin$/);
  await expect(page.getByRole('heading', { name: 'Administration', exact: true, level: 1 })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'My account', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('administration-workspace.png'), fullPage: true });
  for (const name of ['Users', 'Email delivery', 'Teams', 'Roles & permissions', 'Service accounts', 'Backups', 'Appearance', 'Server & network', 'Activity', 'Applications', 'Plugins']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: name === 'Plugins' ? 'Plugin marketplace' : name === 'Users' ? 'Users & access' : name, exact: true, level: 1 })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /^Sign in with/ })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Users', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Users & access', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my workspace', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Users & access', exact: true, level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your workspace, together.' })).toBeVisible();
  await page.goto('/?account');
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
  await page.goto('/?section=users');
  await expect(page.getByRole('heading', { name: 'Your workspace, together.' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('members keep personal access and cannot enter administration or call its API', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const username = `member-${Date.now()}`;
  const password = 'workspace-test-password-2026';
  const post = (path: string, data: object) => page.request.post(path, { headers: { Origin: baseURL! }, data });
  expect((await post('/api/admin/users', { username, password, role: 'member', full_name: 'Workspace Member', email: `${username}@example.test` })).ok()).toBe(true);
  await post('/api/logout', {});
  expect((await post('/api/login', { username, password })).ok()).toBe(true);
  await page.goto('/?workspace=admin&section=users');
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open administration', exact: true })).toHaveCount(0);
  expect((await post('/api/password', { current_password: password, password: `${password}-changed` })).ok()).toBe(true);
  expect((await post('/api/login', { username, password: `${password}-changed` })).ok()).toBe(true);
  let adminReads = 0;
  page.on('request', request => { if (request.url().endsWith('/api/admin/state')) adminReads++; });
  await page.goto('/?workspace=admin&section=users');
  await expect(page.getByRole('heading', { name: 'Administration access required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open administration', exact: true })).toHaveCount(0);
  expect(adminReads).toBe(0);
  expect((await page.request.get('/api/admin/state')).status()).toBe(403);
  expect((await post('/api/admin/apps', { id: 'map', enabled: false })).status()).toBe(403);
  await page.getByRole('button', { name: 'Back to my workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace, together.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Aether Map .*Open application/ })).toBeVisible();
  await page.goto('/?plugins');
  await expect(page.getByRole('heading', { name: 'Plugin marketplace' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Install|Enable|Disable)$/ })).toHaveCount(0);
});

test('leaving administration ignores late responses and role changes remove administrative content', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/state', async route => { await pending; await route.continue(); });
  await page.goto('/?workspace=admin');
  await expect(page.getByText('Loading administration…')).toBeVisible();
  await page.getByRole('button', { name: 'Back to my workspace', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'Your workspace, together.' })).toBeVisible();
  await page.unroute('**/api/admin/state');
  await page.getByRole('button', { name: 'Open administration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true, level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const { user } = await (await fetch('/api/status')).json();
    document.dispatchEvent(new CustomEvent('aether-account', { detail: { ...user, role: 'member' } }));
  });
  await expect(page.getByRole('heading', { name: 'Administration access required' })).toBeVisible();
  await expect(page.getByText('Active users', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open administration', exact: true })).toHaveCount(0);
});

test('administration loading failure is recoverable', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.route('**/api/admin/state', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Administration temporarily unavailable.' }) }), { times: 1 });
  await page.goto('/?workspace=admin');
  await expect(page.getByRole('alert')).toHaveText('Administration temporarily unavailable.');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administration', exact: true, level: 1 })).toBeVisible();
});
