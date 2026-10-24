import { expect, test } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { contentClip } from '../src/surface-assets';
import { documentCommand, openOutput, signIn, switchWorkspace } from './helpers';

for (const timed of [false, true]) test(`live output returns to the mapping grid with ${timed ? 'timed' : 'continuous'} visual content`, async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.source.shader = newShader('tunnel');
  surface.mappingOpacity = .25;
  if (timed) {
    surface.clips = [contentClip(surface.source, [], 0, 'visual')];
    surface.sequence = true;
    surface.source = { mediaId: null, rect: surface.source.rect };
  }
  show.scenes[0].surfaces = [surface];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Mapping output.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await response.json()).id}`);
  await switchWorkspace(page, 'Visualization');
  const output = await openOutput(page);
  await expect(output.locator('.map-surface canvas')).toHaveCount(1);
  await expect(output.locator('.map-surface-grid')).toHaveCount(0);
  await switchWorkspace(page, 'Mapping');
  await expect(output.locator('.map-output')).toHaveAttribute('data-preview', 'mapping');
  await expect(output.locator('.map-surface-grid')).toHaveCount(1);
  await expect(output.locator('.map-surface canvas')).toHaveCount(0);
  await expect(output.locator('.map-surface')).toHaveCSS('opacity', '1');
  await documentCommand(page, 'Mapping grid settings');
  const settings = page.getByRole('dialog', { name: 'Aether Map settings' });
  await expect(settings.getByText('Mapping design', { exact: true })).toBeVisible();
  await settings.getByRole('radio', { name: 'External', exact: true }).click();
  await settings.getByRole('radio', { name: 'Grid', exact: true }).click();
  const sections = settings.getByRole('textbox', { name: 'Sections', exact: true });
  await sections.fill('8'); await sections.press('Tab');
  await expect(output.locator('.map-surface-grid line')).toHaveCount(14);
  // Changing the projector's pattern leaves the device's checkerboard alone.
  await expect(page.locator('.map-artboard .map-surface-grid line')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('mapping-grid-settings.png'), animations: 'disabled' });
  await settings.getByRole('button', { name: /Close/ }).click();
  await output.screenshot({ path: info.outputPath('projected-grid.png') });
  await switchWorkspace(page, 'Visualization');
  await expect(output.locator('.map-surface canvas')).toHaveCount(1);
  await expect(output.locator('.map-surface-grid')).toHaveCount(0);
  await switchWorkspace(page, 'Mapping');
  await expect(output.locator('.map-surface-grid line')).toHaveCount(14);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload();
  await expect(output.locator('.map-surface-grid line')).toHaveCount(14);
  await switchWorkspace(page, 'Visualization');
  await expect(output.locator('.map-surface canvas')).toHaveCount(1);
  await output.close();
});
