import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { clickRibbon, command, openOutput, openTimeline, signIn, solidPng, switchWorkspace, documentCommand, openShowMedia } from './helpers';
const tree = (page: Page) => page.getByRole('tree', { name: 'Layers', exact: true });
// Scenes are the roots of the one content tree, so a surface track is level 2
// and its assets are level 3.
const roots = (page: Page) => tree(page).locator('[role=treeitem][aria-level="2"]');
const children = (page: Page) => tree(page).locator('[role=treeitem][aria-level="3"]');
async function number(page: Page, name: string, value: string) {
  const field = page.getByRole('region', { name: 'Asset properties', exact: true }).getByRole('textbox', { name, exact: true });
  await field.fill(value); await field.press('Tab');
}
async function newSurface(page: Page) {
  await switchWorkspace(page, 'Mapping');
  await clickRibbon(page, 'New Surface');
  await switchWorkspace(page, 'Visualization');
}

test('surfaces are root tracks with editable child assets, shared commands and saved timing', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await newSurface(page);
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveCount(0);
  // Indented by one level: a surface track hangs off its scene now, so the
  // flush-left row in this tree is the scene, not the surface.
  await expect(roots(page).first()).toHaveCSS('padding-left', '16px');
  await clickRibbon(page, 'Text');
  await expect(page.getByRole('dialog', { name: 'Text properties' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Asset duration', exact: true }).first()).toHaveValue('30');
  await page.getByRole('textbox', { name: 'Text content', exact: true }).fill('Welcome');
  await number(page, 'Asset duration', '20');
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  await clickRibbon(page, 'Shader');
  await expect(page.getByRole('region', { name: 'Asset properties', exact: true }).getByRole('textbox', { name: 'Asset start', exact: true })).toHaveValue('20');
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveText(['Welcome', 'Shader']);
  await expect(page.locator('.map-clip')).toHaveCount(2);
  await tree(page).getByRole('button', { name: 'Collapse Surface 1' }).click();
  await expect(children(page)).toHaveCount(0); await expect(page.locator('.map-clip')).toHaveCount(2);
  await tree(page).getByRole('button', { name: 'Expand Surface 1' }).click();
  const welcome = children(page).filter({ hasText: 'Welcome' });
  await welcome.click();
  await expect(await command(page, 'Layer controls', 'Delete asset')).toBeEnabled();
  await page.keyboard.press("Escape");
  await number(page, 'Asset duration', '35');
  await welcome.press('Delete');
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveText(['Shader']);
  await documentCommand(page, "Undo"); await expect(children(page)).toHaveCount(2);
  await children(page).filter({ hasText: 'Shader' }).click();
  await (await command(page, 'Layer controls', 'Move asset earlier')).click();
  await expect(children(page)).toHaveText(['Shader', 'Welcome']);
  await expect(page.locator('.map-save-state')).toHaveText('Saved'); await page.reload();
  await switchWorkspace(page, 'Visualization');
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveText(['Shader', 'Welcome']);
  await welcome.click(); await expect(page.getByRole('region', { name: 'Asset properties', exact: true }).getByRole('textbox', { name: 'Asset duration', exact: true })).toHaveValue('35');
  await page.screenshot({ path: info.outputPath('surface-track-with-assets.png') });
});

test('generated assets obey their durations in projection and videos use their natural length', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await newSurface(page);
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await clickRibbon(page, 'Text'); await number(page, 'Asset start', '1'); await number(page, 'Asset duration', '2');
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const output = await openOutput(page);
  const seek = async (at: number) => {
    const box = (await page.locator('.map-ruler').boundingBox())!;
    expect(box.height).toBeGreaterThan(10);
    await page.mouse.click(box.x + box.width * at / 60, box.y + box.height / 2);
  };
  await seek(.2); await expect(output.locator('.map-text')).toHaveCount(0);
  await seek(1.5); await expect(output.locator('.map-text')).toHaveCount(1);
  await seek(3.5); await expect(output.locator('.map-text')).toHaveCount(0);
  const chooser = page.waitForEvent('filechooser'); await clickRibbon(page, 'Add Media');
  await (await chooser).setFiles(resolve('e2e/fixtures/timing.webm'));
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveCount(2);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  const id = new URL(page.url()).searchParams.get('document')!;
  const response = await page.request.post('/api/library/read', { headers: { Origin: baseURL! }, data: { app: 'map', id } });
  const file = await response.json(), show = JSON.parse(Buffer.from(file.data_base64, 'base64').toString());
  const media = show.media.find((m: { kind: string }) => m.kind === 'video');
  const clip = show.scenes[0].surfaces[0].clips.find((c: { source: { mediaId: string } }) => c.source.mediaId === media.id);
  expect(clip.durationS).toBeCloseTo(media.duration, 3);
  await children(page).filter({ hasText: 'timing.webm' }).click(); await number(page, 'Asset duration', '5');
  await (await command(page, 'Layer controls', 'Delete asset')).click();
  await children(page).first().click(); await (await command(page, 'Layer controls', 'Delete asset')).click();
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveCount(0);
  await seek(1.5); await expect(output.locator('.map-surface')).toHaveCount(0);
});

test('child assets can move between surfaces, lock, duplicate and rename independently', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await newSurface(page);
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await clickRibbon(page, 'Text'); await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  await newSurface(page); await clickRibbon(page, 'Shader');
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const text = children(page).filter({ has: page.locator('.aui-tree-label').filter({ hasText: /^Text$/ }) });
  await text.dragTo(roots(page).filter({ has: page.locator('.aui-tree-label').filter({ hasText: /^Surface 2$/ }) }));
  await expect(roots(page)).toHaveCount(2); await expect(children(page)).toHaveText(['Shader', 'Text']);
  await text.click();
  await expect(page.getByRole('textbox', { name: 'Asset start', exact: true })).toHaveValue('15');
  await text.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Asset duration', exact: true })).toBeDisabled();
  await expect(await command(page, 'Layer controls', 'Delete asset')).toBeDisabled();
  await page.keyboard.press("Escape");
  await text.getByRole('button', { name: 'Unlock Text', exact: true }).click();
  await (await command(page, 'Layer controls', 'Duplicate asset')).click();
  await expect(children(page)).toHaveText(['Shader', 'Text', 'Text']);
  const copy = children(page).last(); await copy.click(); await copy.press('F2');
  const rename = page.getByRole('textbox', { name: 'Rename Text', exact: true });
  await rename.fill('Closing title'); await rename.press('Enter');
  await expect(copy).toContainText('Closing title');
  await expect(page.getByRole('textbox', { name: 'Asset start', exact: true })).toHaveValue('45');
  await expect(page.locator('.map-clip')).toHaveCount(3);
  await (await command(page, 'Layer controls', 'Delete asset')).click();
  await expect(roots(page)).toHaveCount(2); await expect(children(page)).toHaveCount(2);
});

test('library placement appends reusable content without making extra surfaces', async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto('/map/index.html?new=show'); await newSurface(page);
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await switchWorkspace(page, 'Sequence');
  const chooser = page.waitForEvent('filechooser');
  await openShowMedia(page);
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await chooser).setFiles({ name: 'still.png', mimeType: 'image/png', buffer: solidPng(320, 180, [150, 60, 80]) });
  await expect(children(page)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Content action', exact: true }).selectOption('append');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(children(page)).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Content action', exact: true }).selectOption('append');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(roots(page)).toHaveCount(1); await expect(children(page)).toHaveText(['still.png', 'still.png']);
  await children(page).last().click();
  await expect(page.getByRole('textbox', { name: 'Asset start', exact: true })).toHaveValue('30');
  await expect(page.getByRole('textbox', { name: 'Asset duration', exact: true })).toHaveValue('30');
  await expect(page.getByRole('button', { name: 'Remove still.png from this show' })).toBeDisabled();
});
