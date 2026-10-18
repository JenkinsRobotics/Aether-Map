import { expect, test } from '@playwright/test';
import { emptyShow, newSurface } from '../src/document';
import { newShader } from '../src/features/shader-catalog';
import { openOutput, signIn, switchWorkspace } from './helpers';

test('quick audio responses reach actual projector pixels, select the input, and persist without auto-enabling capture', async ({ page, context, baseURL }, info) => {
  await context.addInitScript(() => {
    const host = window as unknown as { __audioByte: number; __audioRequests: unknown[]; AudioContext: unknown };
    host.__audioByte = 0; host.__audioRequests = [];
    const stream = { getTracks: () => [{ stop() {} }] };
    const media = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async (constraints: unknown) => { host.__audioRequests.push(constraints); return stream; },
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'line-in', label: 'Test mixer line input' }],
      addEventListener() {}, removeEventListener() {}, getDisplayMedia: media?.getDisplayMedia?.bind(media),
    } });
    host.AudioContext = class {
      sampleRate = 48000;
      resume() { return Promise.resolve(); }
      createAnalyser() { return { fftSize: 2048, smoothingTimeConstant: 0, frequencyBinCount: 1024,
        getByteFrequencyData: (bins: Uint8Array) => bins.fill(host.__audioByte) }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    };
  });
  await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0);
  surface.name = 'Audio wall'; surface.source.shader = newShader('tunnel');
  show.scenes[0].surfaces = [surface];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', scope: 'personal', name: 'Audio visuals.aethermap', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true);
  await page.goto(`/map/index.html?document=${(await response.json()).id}`);
  await switchWorkspace(page, 'Visualization');
  const row = (name: string) => page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
    .filter({ has: page.locator('.aui-tree-label', { hasText: new RegExp(`^${name}$`) }) });
  await row('Audio wall').click(); await row('Audio wall').press('ArrowRight'); await row('Shader').click();
  const inspector = page.getByRole('region', { name: 'Selection properties' });
  const preset = inspector.getByRole('combobox', { name: 'Audio response preset' });
  await preset.selectOption('bass');
  await inspector.getByText('Configure audio', { exact: true }).click();
  await inspector.getByRole('combobox', { name: 'Audio input device' }).selectOption('line-in');
  await inspector.getByRole('textbox', { name: 'Audio smoothing' }).fill('0');
  await inspector.getByRole('textbox', { name: 'Audio smoothing' }).press('Tab');
  await inspector.getByRole('button', { name: 'Audio off', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Audio on', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __audioRequests: unknown[] }).__audioRequests)).toMatchObject([{ audio: { deviceId: { exact: 'line-in' } } }]);
  const output = await openOutput(page), projected = output.locator('.map-shader canvas');
  await expect(projected).toBeVisible();
  const quiet = await projected.screenshot();
  await page.evaluate(() => { (window as unknown as { __audioByte: number }).__audioByte = 230; });
  await expect.poll(async () => (await projected.screenshot()).equals(quiet)).toBe(false);
  await page.evaluate(() => { (window as unknown as { __audioByte: number }).__audioByte = 0; });
  await expect.poll(async () => (await projected.screenshot()).equals(quiet)).toBe(true);
  expect(await output.evaluate(() => (window as unknown as { __audioRequests: unknown[] }).__audioRequests.length)).toBe(0);
  await row('Audio wall').click(); await row('Shader').click();
  await preset.selectOption('beat');
  await page.evaluate(() => { (window as unknown as { __audioByte: number }).__audioByte = 230; });
  await expect.poll(async () => Number(await inspector.getByRole('meter', { name: 'Detected beat pulse' }).getAttribute('value'))).toBeGreaterThan(.01);
  await expect(inspector.getByRole('combobox', { name: 'Overall scale band' })).toHaveValue('beat');
  await page.screenshot({ path: info.outputPath('audio-reactive-properties.png') });
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await row('Audio wall').click(); await row('Audio wall').press('ArrowRight'); await row('Shader').click();
  await expect(inspector.getByRole('combobox', { name: 'Overall scale band' })).toHaveValue('beat');
  await expect(inspector.getByRole('button', { name: 'Audio off', exact: true })).toBeVisible();
  await preset.selectOption('tempo');
  const bpm = inspector.getByRole('textbox', { name: 'Visual tempo' });
  await bpm.fill('90'); await bpm.press('Tab');
  await expect(bpm).toHaveValue('90');
  expect(await page.evaluate(() => (window as unknown as { __audioRequests: unknown[] }).__audioRequests.length)).toBe(0);
  await expect(page.locator('.map-save-state')).toHaveText('Saved');
  await page.reload(); await switchWorkspace(page, 'Visualization');
  await row('Audio wall').click(); await row('Audio wall').press('ArrowRight'); await row('Shader').click();
  await expect(bpm).toHaveValue('90');
  await output.close();
});
