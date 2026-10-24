import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('Sketch uses shared toolbar placement, sidebar clearance and status', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  expect((await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'sketch',enabled:true}})).ok()).toBe(true);
  await page.goto('/sketch/index.html');
  const ribbon = page.locator('.aui-workspace-ribbon');
  await expect(page.locator('.aui-shell-toolbar .aui-workspace-ribbon')).toBeVisible();
  await expect(ribbon).toHaveAttribute('data-appearance','glass');
  await expect(ribbon).toHaveAttribute('data-docked');
  await expect(page.locator('.aui-status-bar')).toBeVisible();
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  await expect(page.locator('.aui-shell-fltoolbar .aui-workspace-ribbon')).toBeVisible();
  await expect(page.locator('.aui-shell-fltoolbar > .aui-float')).toHaveCSS('display','contents');
  await expect(ribbon).not.toHaveAttribute('data-docked');
  await expect.poll(() => page.locator('.aui-shell').evaluate(el => {
    const center = el.querySelector('.aui-shell-center')!.getBoundingClientRect();
    const toolbar = el.querySelector('.aui-shell-fltoolbar')!.getBoundingClientRect();
    return center.top + parseFloat(getComputedStyle(el).getPropertyValue('--aui-workspace-inset-top')) - toolbar.bottom;
  })).toBeGreaterThanOrEqual(21);
  await expect.poll(() => page.locator('.aui-shell').evaluate(el => {
    const sidebar = el.querySelector('.aui-shell-fledge--left')!.getBoundingClientRect();
    const toolbar = el.querySelector('.aui-shell-fltoolbar')!.getBoundingClientRect();
    return sidebar.top-toolbar.bottom;
  })).toBeGreaterThanOrEqual(21);
  await page.screenshot({path:info.outputPath('sketch-standard-floating.png')});
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Canvas',exact:true}).click();
  await expect(ribbon).toHaveCount(0);
  await page.locator('.aui-shell-edge--top').hover();
  await expect(ribbon).toBeVisible();
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Docked',exact:true}).click();
  await expect(page.locator('.aui-shell-toolbar .aui-workspace-ribbon')).toBeVisible();
});

test('CAD inherits automatic frame recognition without a product opt-in', async ({page,baseURL},info) => {
  await signIn(page,baseURL!);
  await page.goto('/cad/index.html?new=part');
  await page.getByRole('button',{name:'Create Part',exact:true}).click();
  const shell = page.locator('.aui-shell').first();
  for (let i=0;i<3 && await shell.getAttribute('data-layout') !== 'floating';i++) {
    await page.getByRole('button',{name:/^Studio mode:/}).click();
  }
  await expect(shell).toHaveAttribute('data-layout','floating');
  await expect(page.locator('.aui-shell-fltoolbar')).toHaveAttribute('data-toolbar-frame','auto');
  await expect(page.locator('.aui-shell-fltoolbar > .aui-float')).toHaveCSS('display','contents');
  await expect(page.locator('.aui-shell-fltoolbar .aui-workspace-ribbon')).toBeVisible();
  await page.screenshot({path:info.outputPath('cad-single-toolbar-frame.png')});
});
