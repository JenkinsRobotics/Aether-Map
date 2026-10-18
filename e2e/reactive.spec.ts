import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, openOutput, openPanel, runCommand, saveShow, signIn, switchWorkspace } from "./helpers";

const canvas = (page: Page) => page.locator(".map-canvas-host").first();

/**
 * Stand-ins for hardware this machine does not have. They are deliberately
 * dumb — a fixed spectrum, a MIDI port we can post to — because what is being
 * tested is the wiring from a device to a projected parameter, not an
 * AnalyserNode's arithmetic, which its own unit tests cover.
 */
async function fakeDevices(page: Page, { level = 200 } = {}) {
  await page.addInitScript((byte: number) => {
    const tracks = [{ stop() {}, addEventListener() {} }];
    const stream = { getTracks: () => tracks, getVideoTracks: () => tracks, getAudioTracks: () => tracks };
    const media = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: Object.assign(Object.create(Object.getPrototypeOf(media) as object), media, {
        getUserMedia: async () => stream,
        getDisplayMedia: async () => stream,
        enumerateDevices: async () => [],
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    class FakeAudioContext {
      sampleRate = 48000;
      resume() { return Promise.resolve(); }
      createAnalyser() {
        return {
          fftSize: 1024, smoothingTimeConstant: 0, frequencyBinCount: 512,
          getByteFrequencyData: (bins: Uint8Array) => bins.fill(byte),
          connect() {},
        };
      }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

    // One MIDI input the test can post control changes into.
    const port = { name: "Test desk", onmidimessage: null as null | ((event: { data: Uint8Array }) => void) };
    (window as unknown as { __midi: unknown }).__midi = port;
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => ({ inputs: { values: () => [port] }, onstatechange: null }),
    });
  }, level);
}

/** Put a shader surface on the canvas and open its properties. */
async function shaderSurface(page: Page) {
  await switchWorkspace(page, "Visualization");
  await openPanel(page, "Layers");
  await runCommand(page, "Layer controls", "Add a ready-made scene");
  await page.getByRole("dialog", { name: "Ready-made scenes" }).getByRole("button", { name: /Spectral swirl/ }).click();
  await openPanel(page, "Layers");
  // Select the shader child, not its containing surface.
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const surface = tree.locator('[role=treeitem][aria-level="2"]').first();
  await surface.click(); await surface.press('ArrowRight');
  await tree.locator('[role=treeitem][aria-level="3"]').first().click();
  await openPanel(page, "Properties");
}

test("a shader parameter can be handed to the microphone and back", async ({ page, baseURL }) => {
  await fakeDevices(page);
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await shaderSurface(page);

  // Put a parameter on a cycle, then hand that cycle to the sound.
  await page.getByRole("button", { name: "Animate a parameter" }).click();
  const menu = page.getByRole("menu", { name: "Animate a parameter" });
  await menu.getByRole("menuitemcheckbox").first().click();
  const source = page.getByRole("combobox", { name: /source$/ }).first();
  await source.selectOption("audio");
  await expect(page.getByRole("combobox", { name: /band$/ }).first()).toBeVisible();

  // Until the microphone is on, the panel says so rather than silently doing
  // nothing — a parameter following a device that is off is a dead control.
  await expect(page.getByText(/Turn on Audio or/)).toBeVisible();
  await page.getByRole("button", { name: "Audio off" }).click();
  await expect(page.getByRole("button", { name: "Audio on" })).toBeVisible();
  await expect(page.getByText(/Turn on Audio or/)).toBeHidden();
  // The surface is still rendering, not thrown by a live parameter.
  await expect(canvas(page).locator(".map-shader").first()).toBeVisible();

  const id = await saveShow(page, "Reactive audio");
  await page.goto(`/map/index.html?document=${id}`);
  await switchWorkspace(page, "Visualization");
  await openPanel(page, "Layers");
  // Select the shader child, not its containing surface.
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const surface = tree.locator('[role=treeitem][aria-level="2"]').first();
  await surface.click(); await surface.press('ArrowRight');
  await tree.locator('[role=treeitem][aria-level="3"]').first().click();
  await openPanel(page, "Properties");
  // The binding is document state; the microphone is not.
  await expect(page.getByRole("combobox", { name: /source$/ }).first()).toHaveValue("audio");
  await expect(page.getByRole("button", { name: "Audio off" })).toBeVisible();
});

test("MIDI learn binds the fader that was actually moved", async ({ page, baseURL }) => {
  await fakeDevices(page);
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await shaderSurface(page);

  await page.getByRole("button", { name: "Animate a parameter" }).click();
  await page.getByRole("menu", { name: "Animate a parameter" }).getByRole("menuitemcheckbox").first().click();
  await page.getByRole("combobox", { name: /source$/ }).first().selectOption("midi");
  const controller = page.getByRole("textbox", { name: /controller$/ }).first();
  await expect(controller).toBeVisible();

  await page.getByRole("button", { name: "MIDI off" }).click();
  await expect(page.getByRole("button", { name: "MIDI on" })).toBeVisible();

  // Move fader 74 on the desk. Learn beats counting controller numbers.
  await page.evaluate(() => {
    const port = (window as unknown as { __midi: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midi;
    port.onmidimessage?.({ data: new Uint8Array([0xb0, 74, 100]) });
  });
  await page.getByRole("button", { name: "Use the last fader moved" }).first().click();
  await expect(controller).toHaveValue("74");

  // A note, not a control change, must not rebind anything.
  await page.evaluate(() => {
    const port = (window as unknown as { __midi: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midi;
    port.onmidimessage?.({ data: new Uint8Array([0x90, 60, 127]) });
  });
  await page.getByRole("button", { name: "Use the last fader moved" }).first().click();
  await expect(controller).toHaveValue("74");
  // Armed Learn waits for a new message, rather than binding the old fader.
  await page.getByRole('button', { name: 'MIDI Learn', exact: true }).first().click();
  await expect(controller).toHaveValue('74');
  await page.evaluate(() => {
    const port = (window as unknown as { __midi: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midi;
    port.onmidimessage?.({ data: new Uint8Array([0xb0, 7, 20]) });
  });
  await expect(controller).toHaveValue('7');
  await expect(page.getByRole('button', { name: 'MIDI Learn', exact: true }).first()).toHaveAttribute('aria-pressed', 'false');
});

test("paint lands on the projection, not just the editor", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await saveShow(page, "Painted show");
  const output = await openOutput(page);
  await expect(output.locator(".map-output-raster")).toBeVisible();

  await clickRibbon(page, "Paint");
  await expect(page.locator(".map-brush")).toBeVisible();
  const box = (await canvas(page).boundingBox())!;
  const stroke = async (offset: number) => {
    await page.mouse.move(box.x + 120, box.y + 120 + offset);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) await page.mouse.move(box.x + 120 + step * 20, box.y + 140 + offset);
    await page.mouse.up();
  };
  await stroke(0);

  // The stroke is content: it renders in the editor and on the projector alike.
  await expect(canvas(page).locator(".map-drawn polyline")).toHaveCount(1);
  await expect(output.locator(".map-drawn polyline")).toHaveCount(1);

  // A second stroke joins the same painting rather than making another layer.
  await stroke(60);
  await expect(canvas(page).locator(".map-drawn polyline")).toHaveCount(2);
  await openPanel(page, "Layers");
  await expect(page.getByRole("tree", { name: "Layers", exact: true })
    .getByRole("treeitem", { name: /Painting/ })).toHaveCount(1);
  await output.close();
});

test('editor MIDI changes reach actual projector pixels without a second device connection', async ({ page, baseURL }, info) => {
  const { emptyShow, newSurface } = await import('../src/document');
  const { newShader } = await import('../src/features/shader-catalog');
  await fakeDevices(page); await signIn(page, baseURL!);
  const show = emptyShow(), surface = newSurface(show.output, 0); surface.name = 'Reactive tunnel';
  surface.source.shader = newShader('tunnel');
  surface.source.shader.modulation = { scale: { source: 'midi', control: 74, amount: 1, periodS: 4, waveform: 'sine', phase: 0, range: { min: .5, max: 2 } } };
  show.scenes[0].surfaces = [surface];
  const response = await page.request.post('/api/library/create', { headers: { Origin: baseURL! }, data: {
    app: 'map', name: 'Reactive output.aethermap', scope: 'personal', data_base64: Buffer.from(JSON.stringify(show)).toString('base64'),
  } });
  expect(response.ok()).toBe(true); const file = await response.json();
  await page.goto(`/map/index.html?document=${file.id}`); await switchWorkspace(page, 'Visualization');
  const row = page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
    .filter({ has: page.locator('.aui-tree-label', { hasText: /^Reactive tunnel$/ }) });
  await row.click(); await row.press('ArrowRight');
  await page.getByRole('tree', { name: 'Layers', exact: true }).getByRole('treeitem')
    .filter({ has: page.locator('.aui-tree-label', { hasText: /^Shader$/ }) }).click();
  await openPanel(page, 'Properties');
  await page.getByRole('button', { name: 'MIDI off', exact: true }).click();
  const output = await openOutput(page), projected = output.locator('.map-shader canvas');
  await expect(projected).toBeVisible(); const first = await projected.screenshot();
  await page.evaluate(() => {
    const port = (window as unknown as { __midi: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midi;
    port.onmidimessage?.({ data: new Uint8Array([0xb0, 74, 127]) });
  });
  await expect.poll(async () => (await projected.screenshot()).equals(first)).toBe(false);
  const changed = await projected.screenshot();
  await page.evaluate(() => {
    const port = (window as unknown as { __midi: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midi;
    port.onmidimessage?.({ data: new Uint8Array([0xb0, 74, 0]) });
  });
  await expect.poll(async () => (await projected.screenshot()).equals(changed)).toBe(false);
  await expect.poll(async () => (await projected.screenshot()).equals(first)).toBe(true);
  await output.screenshot({ path: info.outputPath('midi-projector.png') }); await output.close();
});
