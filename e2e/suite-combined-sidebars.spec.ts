import { expect, test } from '@playwright/test';
import { createIOProject, signIn } from './helpers';

for (const app of ['cad', 'map', 'io', 'animation', 'sketch']) {
  test(`${app} uses the shared combined sidebar at desktop and smaller sizes`, async ({ page, baseURL }, info) => {
    await signIn(page, baseURL!);
    expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: app, enabled: true } })).ok()).toBe(true);
    const suffix = app === 'cad' ? '?new=part' : app === 'map' ? '?new=show' : '';
    await page.goto(`/${app}/index.html${suffix}`);
    if (app === 'cad') await page.getByRole('button', { name: 'Create Part', exact: true }).click();
    if (app === 'io') await createIOProject(page);
    const shell = page.locator('.aui-shell').first();
    await expect(shell).toBeVisible();
    for (const width of [1600, 1080]) {
      await page.setViewportSize({ width, height: 900 });
      for (const side of ['Left', 'Right']) {
        const card = shell.getByRole('complementary', { name: `${side} sidebar`, exact: true });
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute('data-attachment', 'attached');
        if (await card.getAttribute('data-open') === 'false') await card.getByRole('toolbar').getByRole('button').first().click();
        await expect(card).toHaveAttribute('data-open', 'true');
        await expect(card).toHaveCSS('gap', '0px');
        await expect(card).toHaveCSS('border-top-width', await shell.getAttribute('data-layout') === 'docked' ? '0px' : '1px');
        for (const child of ['.aui-tabbed-sidebar-tabs', '.aui-tabbed-sidebar-content']) {
          await expect(card.locator(child)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(card.locator(child)).toHaveCSS('border-top-width', '0px');
          await expect(card.locator(child)).toHaveCSS('box-shadow', 'none');
        }
        await card.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
        const joined = await card.evaluate(node => {
          const frame = node.getBoundingClientRect();
          const tray = node.querySelector('.aui-tabbed-sidebar-tabs')!.getBoundingClientRect();
          const content = node.querySelector('.aui-tabbed-sidebar-content')!.getBoundingClientRect();
          const vertical = node.getAttribute('data-orientation') === 'vertical';
          const gap = vertical ? Math.min(Math.abs(tray.right-content.left), Math.abs(content.right-tray.left)) : Math.min(Math.abs(tray.bottom-content.top), Math.abs(content.bottom-tray.top));
          return { gap, contained: tray.left >= frame.left && tray.right <= frame.right + 1 && content.left >= frame.left && content.right <= frame.right + 1 };
        });
        expect(joined.gap).toBeLessThanOrEqual(1);
        expect(joined.contained).toBe(true);
        const selected = card.getByRole('toolbar').locator('button[aria-pressed=true]');
        const label = await selected.getAttribute('aria-label');
        await selected.click();
        await expect(card).toHaveAttribute('data-expanded', 'false');
        await card.getByRole('toolbar').getByRole('button', { name: label!, exact: true }).click();
        await expect(card).toHaveAttribute('data-open', 'true');
      }
      await page.screenshot({path: info.outputPath(`${app}-combined-${width}.png`), animations:'disabled'});
    }
  });
}
