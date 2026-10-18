import { expect, test, type Locator } from '@playwright/test';
import { createIOProject, openAppSettings, signIn } from './helpers';

async function settle(element: Locator) {
  await element.evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
}

test('shared card keeps its tray anchored in every orientation and opening direction', async ({ page, baseURL }, info) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: 'ui', enabled: true } })).ok()).toBe(true);
  await page.goto('/ui/index.html#tab=widgets');
  const demo = page.getByRole('region', { name: 'Full-height tabbed sidebar showcase' });
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('combobox', { name: 'Sidebar attachment preview' }).selectOption('attached');
  let buttonStyle: unknown;
  for (const side of ['left', 'right']) {
    await demo.getByRole('combobox', { name: 'Tabbed sidebar side' }).selectOption(side);
    for (const outside of [false, true]) {
      await demo.getByRole('checkbox', { name: 'Open toward window edge' }).setChecked(outside);
      for (const position of ['Top', 'Bottom', 'Side']) {
        const preview = demo.getByRole('region', { name: `${position} tabs preview` });
        await preview.scrollIntoViewIfNeeded();
        const card = preview.locator('.aui-tabbed-sidebar');
        const tray = card.getByRole('toolbar');
        const tab = tray.getByRole('button', { name: 'Properties', exact: true });
        await settle(card);
        const style = await tab.evaluate(node => { const s = getComputedStyle(node); return [s.width, s.height, s.backgroundColor, s.color, s.borderRadius, s.borderWidth]; });
        buttonStyle ??= style;
        expect(style).toEqual(buttonStyle);
        for (const child of ['.aui-tabbed-sidebar-tabs', '.aui-tabbed-sidebar-content']) {
          await expect(card.locator(child)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(card.locator(child)).toHaveCSS('border-top-width', '0px');
          await expect(card.locator(child)).toHaveCSS('box-shadow', 'none');
        }
        const draft = card.getByRole('textbox', { name: 'Location X', exact: true });
        await draft.fill('125'); await draft.press('Enter');
        const before = (await tab.boundingBox())!;
        const openCard = (await card.boundingBox())!;
        const samples = await card.evaluate(async node => {
          const dimensions: number[] = [];
          node.querySelector<HTMLButtonElement>('[aria-label="Properties"]')!.click();
          const start = performance.now();
          await new Promise<void>(resolve => {
            const tick = () => { const r = node.getBoundingClientRect(); dimensions.push(node.getAttribute('data-orientation') === 'vertical' ? r.width : r.height); if (performance.now() - start > 400) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
          });
          return dimensions;
        });
        const low = Math.min(...samples), high = Math.max(...samples);
        expect(high - low).toBeGreaterThan(100);
        expect(samples.some(n => n > low + 5 && n < high - 5)).toBe(true);
        await expect(card).toHaveAttribute('data-expanded', 'false');
        const closed = (await tab.boundingBox())!;
        if (position === 'Side') expect(closed.x).toBeCloseTo(before.x, 0);
        else {
          const c = (await card.boundingBox())!;
          expect(side === 'left' ? c.x : c.x+c.width).toBeCloseTo(side === 'left' ? openCard.x : openCard.x+openCard.width, 0);
        }
        if (position === 'Side') expect(closed.y).toBeCloseTo(before.y, 0);
        else {
          const collapsedCard = (await card.boundingBox())!;
          expect(collapsedCard.y + collapsedCard.height).toBeCloseTo(openCard.y + openCard.height, 0);
          expect(collapsedCard.height).toBeLessThan(60);
          if (await card.getAttribute('data-tabs') === 'top') expect(closed.y).toBeGreaterThan(before.y + 100);
        }
        await tab.click();
        await settle(card);
        await expect(draft).toHaveValue('125');
        expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      }
    }
  }
  await demo.getByRole('checkbox', { name: 'Open toward window edge' }).uncheck();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.classList.toggle('aether-light-theme', theme === 'light'); document.documentElement.dataset.aetherTheme = theme; }, theme);
    await demo.screenshot({ path: info.outputPath(`unified-${theme}.png`), animations: 'disabled' });
  }
});

test('IO side rail inherits the unified frame and persisted shared direction setting', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: 'io', enabled: true } })).ok()).toBe(true);
  await page.goto('/io/');
  await createIOProject(page);
  await openAppSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Aether IO settings' });
  await dialog.getByRole('button', { name: 'Toolbars & tabs', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Sidebar tab placement' }).selectOption('rail');
  await dialog.getByRole('combobox', { name: 'Sidebar container' }).selectOption('attached');
  await dialog.getByRole('combobox', { name: 'Sidebar opening direction' }).selectOption('inside');
  await dialog.getByRole('button', { name: /Close/ }).click();
  const card = page.getByRole('complementary', { name: 'Right sidebar', exact: true });
  await expect(card).toHaveAttribute('data-tabs', 'right');
  await expect(card.getByRole('button', { name: /^Float |^Close / })).toHaveCount(0);
  const draft = card.getByRole('textbox', { name: 'Component name', exact: true });
  await draft.fill('Unified sidebar test');
  await card.getByRole('toolbar').getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  await card.getByRole('toolbar').getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(draft).toHaveValue('Unified sidebar test');
  await settle(card);
  await page.screenshot({ path: info.outputPath('io-unified-rail.png') });
  await page.reload();
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await expect(card).toHaveAttribute('data-tabs', 'right');
  await expect(card).toHaveAttribute('data-attachment', 'attached');
});
