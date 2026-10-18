import { expect, test, type Locator } from '@playwright/test';
import { emptyShow, newScene, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { openAppSettings, openPanel, signIn, switchWorkspace } from './helpers';

async function fits(panel: Locator) {
  await expect.poll(() => panel.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1 && [...element.querySelectorAll('input,select,button')]
      .filter(control => control.checkVisibility())
      .every(control => {
        const box = control.getBoundingClientRect();
        return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
      });
  })).toBe(true);
}

test('all right-side inspectors use compact rows in light and dark without losing editing', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.name = 'Wall'; surface.source.shader = newShader('tunnel');
  show.scenes[0].surfaces = [surface]; show.scenes.push(newScene('Lobby'));
  const created = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Compact inspector.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(created.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await created.json()).id}`);
  const layer = (name: string) => page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
    .filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
  const properties = page.getByRole('region', { name: 'Selection properties' });
  const currentPanel = page.locator('.map-inspector:visible');
  for (const mode of ['light', 'dark']) {
    await openAppSettings(page);
    const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
    await settings.getByRole('button', { name: 'Appearance & icons', exact: true }).click();
    await settings.getByRole('combobox', { name: 'Interface theme' }).selectOption('aether-studio');
    await settings.getByRole('combobox', { name: 'Color mode' }).selectOption(mode);
    await settings.getByRole('button', { name: /Close/ }).click();
    await switchWorkspace(page, 'Mapping'); await openPanel(page, 'Layers'); await layer('Wall').click();
    await fits(currentPanel);
    const name = properties.getByRole('textbox', { name: 'Surface name' });
    const alignment = await name.evaluate(element => {
      const label = element.closest('.aui-field-row')!.querySelector('label')!.getBoundingClientRect();
      const input = element.getBoundingClientRect();
      return Math.abs(label.y + label.height / 2 - input.y - input.height / 2);
    });
    expect(alignment).toBeLessThan(3);
    const opacity = properties.getByRole('textbox', { name: 'Mapping opacity' });
    await opacity.fill('45'); await opacity.press('Tab'); await expect(opacity).toHaveValue('45');
    await page.screenshot({ path: info.outputPath(`surface-${mode}.png`), animations: 'disabled' });
    for (const panel of ['Transform', 'Output', 'Scene setup']) {
      await openPanel(page, panel); await fits(currentPanel);
      await page.screenshot({ path: info.outputPath(`${panel}-${mode}.png`), animations: 'disabled' });
    }
    await switchWorkspace(page, 'Visualization');
    await layer('Wall').click();
    for (const panel of ['Color', 'Program']) {
      await openPanel(page, panel); await fits(currentPanel);
      await page.screenshot({ path: info.outputPath(`${panel}-${mode}.png`), animations: 'disabled' });
    }
    const shader = page.getByRole('tree', { name: 'Clip index', exact: true }).getByRole('treeitem').first();
    await shader.dblclick();
    await expect(properties.getByRole('textbox', { name: 'Surface name' })).toHaveCount(0);
    const speed = properties.getByRole('textbox', { name: 'Animation speed', exact: true });
    await speed.fill('2'); await speed.press('Tab'); await expect(speed).toHaveValue('2');
    await properties.getByRole('textbox', { name: 'Asset name' }).scrollIntoViewIfNeeded();
    await fits(currentPanel);
    await page.screenshot({ path: info.outputPath(`shader-${mode}.png`), animations: 'disabled' });
    for (const tab of ['Targets', 'Fit', 'Effects']) {
      await properties.getByRole('tab', { name: tab, exact: true }).click(); await fits(currentPanel);
    }
    await properties.getByRole('tab', { name: 'Adjust', exact: true }).click();
  }
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await layer('Wall').click();
  await switchWorkspace(page, 'Mapping');
  await expect(properties.getByRole('textbox', { name: 'Mapping opacity' })).toHaveValue('45');
});
