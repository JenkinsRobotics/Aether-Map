import { expect, test, type Locator } from '@playwright/test';
import { signIn } from './helpers';

async function settled(preview: Locator) {
  await preview.evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}

test('top and bottom tabbed sidebars fill the safe height, retain edits and scroll independently', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: 'ui', enabled: true } })).ok()).toBe(true);
  await page.goto('/ui/index.html#tab=widgets');
  const demo = page.getByRole('region', { name: 'Full-height tabbed sidebar showcase' });
  await demo.scrollIntoViewIfNeeded();
  for (const position of ['Top', 'Bottom']) {
    const preview = demo.getByRole('region', { name: `${position} tabs preview` });
    // Sections with accessible names are landmarks.
    const sidebar = preview.getByRole('complementary', { name: 'Right sidebar' });
    await expect(sidebar).toBeVisible();
    await settled(preview);
    const bounds = await sidebar.evaluate(element => {
      const frame = element.getBoundingClientRect();
      const area = element.closest('.aui-shell-area')!.getBoundingClientRect();
      const tabs = element.querySelector('.aui-tabbed-sidebar-tabs')!.getBoundingClientRect();
      const body = element.querySelector('.aui-tabbed-sidebar-content')!.getBoundingClientRect();
      const toolbar = element.closest('.aui-shell-area')!.querySelector('.aui-shell-fltoolbar')!.getBoundingClientRect();
      return { height: frame.height, bottom: area.bottom - frame.bottom, clearance: frame.top - toolbar.bottom, tabsTop: tabs.top, tabsBottom: tabs.bottom, bodyTop: body.top, bodyBottom: body.bottom, overflow: element.scrollWidth - element.clientWidth };
    });
    expect(bounds.height).toBeGreaterThan(440);
    expect(bounds.bottom).toBeCloseTo(10, 0);
    expect(bounds.clearance).toBeGreaterThanOrEqual(21);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    if (position === 'Top') expect(bounds.tabsBottom).toBeLessThanOrEqual(bounds.bodyTop);
    else expect(bounds.tabsTop).toBeGreaterThan(bounds.bodyBottom);
    const tabs = sidebar.getByRole('toolbar');
    const draft = sidebar.getByRole('textbox', { name: 'Location X', exact: true });
    await draft.fill('125'); await draft.press('Enter');
    await sidebar.getByRole('button', { name: 'Lock Location X', exact: true }).click();
    await expect(sidebar.getByRole('button', { name: 'Lock Location X', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(draft).toBeDisabled();
    await tabs.getByRole('button', { name: 'Structure', exact: true }).click();
    await expect(sidebar.getByRole('checkbox', { name: 'Body 01', exact: true })).toBeVisible();
    await tabs.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(draft).toHaveValue('125');
    await expect(draft).toBeDisabled();
    await tabs.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(sidebar).toHaveAttribute('data-expanded', 'false');
    await tabs.getByRole('button', { name: 'Properties', exact: true }).press('Enter');
    await expect(sidebar).toHaveAttribute('data-expanded', 'true');
    await expect(draft).toHaveValue('125');
    await sidebar.getByRole('button', { name: 'Plan from camera', exact: true }).click();
    await expect(sidebar.getByRole('status')).toHaveText('Construction plane from camera');
    await expect(tabs).toBeVisible();
  }
  await demo.screenshot({ path: info.outputPath('floating-tabs-top-bottom.png'), animations: 'disabled' });
  for (const side of ['left', 'right']) {
    await demo.getByRole('combobox', { name: 'Tabbed sidebar side' }).selectOption(side);
    await demo.getByRole('combobox', { name: 'Tabbed sidebar layout' }).selectOption('docked');
    for (const position of ['Top', 'Bottom']) {
      const preview = demo.getByRole('region', { name: `${position} tabs preview` });
      await settled(preview);
      const measurements = await preview.locator('.aui-tabbed-sidebar').evaluate(element => ({ panel: element.getBoundingClientRect().height, area: element.closest('.aui-shell-area')!.getBoundingClientRect().height }));
      expect(measurements.panel).toBeCloseTo(measurements.area, 0);
      await expect(preview.getByRole('textbox', { name: 'Location X', exact: true })).toHaveValue('125');
    }
  }
  await demo.getByRole('combobox', { name: 'Tabbed sidebar layout' }).selectOption('canvas');
  const top = demo.getByRole('region', { name: 'Top tabs preview' });
  await expect(top.getByRole('complementary')).toHaveCount(0);
  await top.locator('.aui-shell-edge--right').hover();
  await expect(top.getByRole('complementary', { name: 'Right sidebar' })).toBeVisible();
  await demo.getByRole('combobox', { name: 'Tabbed sidebar layout' }).selectOption('floating');
  await page.setViewportSize({ width: 700, height: 900 });
  await demo.scrollIntoViewIfNeeded();
  expect(await demo.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test('tab strip supports keyboard activation and overflow in light and dark themes', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', { headers: { Origin: baseURL! }, data: { id: 'ui', enabled: true } })).ok()).toBe(true);
  await page.goto('/ui/index.html#tab=widgets');
  const demo = page.getByRole('region', { name: 'Full-height tabbed sidebar showcase' });
  await demo.scrollIntoViewIfNeeded();
  const preview = demo.getByRole('region', { name: 'Top tabs preview' });
  const bar = preview.getByRole('toolbar', { name: 'Right sidebar tabs' });
  await bar.getByRole('button', { name: 'Properties' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(bar.getByRole('button', { name: 'Structure' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preview.getByRole('checkbox', { name: 'Body 01', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(bar.getByRole('button', { name: 'Display', exact: true })).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.classList.toggle('aether-light-theme', theme === 'light'); document.documentElement.dataset.aetherTheme = theme; }, theme);
    await demo.screenshot({ path: info.outputPath(`tabbed-sidebar-${theme}.png`), animations: 'disabled' });
  }
  await preview.locator('.aui-tabbed-sidebar').evaluate(element => { (element as HTMLElement).style.width = '120px'; });
  await bar.getByRole('button', { name: 'Properties' }).focus();
  await page.keyboard.press('End');
  await expect(bar.getByRole('button', { name: 'Display', exact: true })).toBeFocused();
  expect(await bar.evaluate(element => element.scrollWidth > element.clientWidth && element.scrollLeft > 0)).toBe(true);
  expect(await demo.locator('[data-icon-missing]').count()).toBe(0);
});
