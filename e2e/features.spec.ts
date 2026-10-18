import { expect, test, type Page } from "@playwright/test";
import { command, openOutput, openOutputProperties, openTimeline, saveShow, signIn, clickRibbon, documentCommand, switchWorkspace } from "./helpers";

async function accept(page: Page) { await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible(); }
test("input crop preserves the full preview and projects only the chosen media pixels", async ({ page, baseURL }) => {
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red"; context.fillRect(0, 0, 160, 180);
    context.fillStyle = "blue"; context.fillRect(160, 0, 160, 180);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await clickRibbon(page, "New Surface"); await accept(page);
  await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles({ name: "two-halves.png", mimeType: "image/png", buffer: Buffer.from(fixture, "base64") });
  await expect(page.locator(".map-surface img")).toBeVisible();
  await (await command(page, "Layer controls", "Asset properties")).click();
  await page.getByText("Input crop", { exact: true }).click();
  await page.getByLabel("Input crop left", { exact: true }).fill("160");
  await page.getByLabel("Input crop left", { exact: true }).press("Tab");
  await expect(page.getByLabel("Input crop width", { exact: true })).toHaveValue("160");
  await accept(page);
  const output = await openOutput(page);
  await expect.poll(() => output.locator(".map-surface img").evaluate((el) => (el as HTMLElement).style.clipPath)).toBe("inset(0px 0px 0px 160px)");
  await expect.poll(() => output.locator(".map-surface img").evaluate((el) => (el as HTMLElement).style.width)).toBe("320px");
  await expect(page.locator(".map-input-crop rect")).toHaveAttribute("x", "160");
  // Sample the actual output screenshot, including its transform and clip.
  const screenshot = await output.screenshot();
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(image.width / 2, image.height / 2, 1, 1).data];
  }, screenshot.toString("base64"));
  expect(pixels).toEqual([0, 0, 255, 255]);
  await saveShow(page, "Input crop review"); await page.reload(); await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-surface img")).toHaveCSS("clip-path", "inset(0px 0px 0px 160px)");
  await output.close();
});

test("inline properties, all shader effects, input preview and deterministic projection", async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await clickRibbon(page, "Shader");
  const dialog = page.getByRole("region", { name: "Selection properties" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath("shader-properties.png") });
  await dialog.getByLabel("Distortion", { exact: true }).fill("0.45");
  await dialog.getByLabel("Distortion", { exact: true }).press("Tab");
  await accept(page);
  const output = await openOutput(page);
  const inputShader = page.locator(".map-input-preview .map-shader");
  const previewShader = page.locator(".map-output-preview .map-shader");
  await expect(inputShader.locator("canvas")).toBeVisible();
  await expect(previewShader.locator("canvas")).toBeVisible();
  await expect(output.locator(".map-shader canvas")).toBeVisible();
  await page.getByRole("button", { name: "X-ray", exact: true }).click();
  await expect(page.locator(".map-output-preview .map-surface")).toHaveCSS("opacity", "0.2");
  await expect(output.locator(".map-surface")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "X-ray", exact: true }).press("Space");
  await expect(page.locator(".map-output-preview .map-surface")).toHaveCSS("opacity", "1");
  await clickRibbon(page, "Pause");
  // The public renderer exposes its animation clock. All three views use scene time.
  await page.getByLabel("Keyframe time", { exact: true }).fill("3");
  await page.getByLabel("Keyframe time", { exact: true }).press("Tab");
  for (const source of [inputShader, previewShader, output.locator(".map-shader")]) {
    await expect.poll(() => source.locator(":scope > div").first().evaluate((el) => (el as HTMLElement & { paperShaderMount?: { getCurrentFrame: () => number } }).paperShaderMount?.getCurrentFrame())).toBe(3000);
  }
  const before = await previewShader.screenshot();
  await page.getByLabel("Keyframe time", { exact: true }).fill("6"); await page.getByLabel("Keyframe time", { exact: true }).press("Tab");
  expect((await previewShader.screenshot()).equals(before)).toBe(false);
  await expect(page.locator(".map-keyframe")).toHaveCount(0);

  // The effect picker is a menu, not a select: the catalogue is grouped and
  // marks which effects need a picture, which options cannot carry.
  const picker = page.getByLabel("Shader effect", { exact: true });
  const chooseShader = async (effect: string) => {
    await picker.click();
    await page.locator(`[role="menu"] [data-menu-item-id="${effect}"]`).click();
  };
  await picker.click();
  const effects = await page.locator('[role="menu"] [data-menu-item-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-menu-item-id")!));
  // 27 upstream effects plus Aether's own two. Each one below is then actually
  // chosen and rendered in both the editor and the output window, so a shader
  // that fails to compile on this machine's GPU fails here rather than on a wall.
  expect(effects.filter((id) => !["kaleidoscope", "tunnel"].includes(id))).toHaveLength(27);
  expect(effects).toContain("kaleidoscope");
  expect(effects).toContain("tunnel");
  await page.keyboard.press("Escape");
  for (const effect of effects) {
    await chooseShader(effect);
    await expect(previewShader).toHaveAttribute("data-shader", effect);
    await expect(output.locator(".map-shader")).toHaveAttribute("data-shader", effect);
    await expect(previewShader.locator("canvas")).toBeVisible();
    await expect.poll(() => previewShader.locator("canvas").evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(10);
    // Aether's own two are hand-written GLSL: a compile failure on this GPU
    // would land in the shader boundary, so its message must not be on screen.
    await expect(page.getByText("Shader unavailable on this device.")).toHaveCount(0);
  }
  await chooseShader("mesh-gradient");
  await page.screenshot({ path: info.outputPath("shader-workspace.png") });
  await saveShow(page, "Shader feature review"); await page.reload(); await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-shader").first()).toHaveAttribute("data-shader", "mesh-gradient");
  await clickRibbon(page, "Text");
  await page.getByLabel("Text content", { exact: true }).fill("Projection\nReady");
  await page.getByLabel("Font weight", { exact: true }).selectOption("700");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await accept(page);
  await expect(page.locator(".map-surface .map-text")).toHaveText("Projection\nReady");
  await clickRibbon(page, "Edit feature");
  await page.getByLabel("Text content", { exact: true }).fill("discard me");
  await documentCommand(page, "Undo");
  await expect(page.locator(".map-surface .map-text")).toHaveText("Projection\nReady");
  // Mapping geometry is created immediately; undo/redo must preserve it.
  const beforeMask = await page.locator(".map-outline").count();
  await clickRibbon(page, "Mask");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".map-outline")).toHaveCount(beforeMask + 1);
  await documentCommand(page, "Undo");
  await expect(page.locator(".map-outline")).toHaveCount(beforeMask);
  await documentCommand(page, "Redo");
  await expect(page.locator(".map-outline")).toHaveCount(beforeMask + 1);
  await output.close();
});

test("feature keyframes fade and move projection; explicit output crop, drag and blackout", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  await clickRibbon(page, "Text"); await accept(page);
  const output = await openOutput(page);
  await page.getByRole("button", { name: "Add keyframe", exact: true }).click();
  await page.getByLabel("Keyframe time", { exact: true }).fill("10"); await page.getByLabel("Keyframe time", { exact: true }).press("Tab");
  await page.getByLabel("Animated value", { exact: true }).fill("0"); await page.getByLabel("Animated value", { exact: true }).press("Tab");
  await page.getByLabel("Keyframe time", { exact: true }).fill("5"); await page.getByLabel("Keyframe time", { exact: true }).press("Tab");
  await expect.poll(() => output.locator(".map-surface").evaluate((el) => (el as HTMLElement).style.opacity)).toBe("0.5");
  await expect(page.locator(".map-keyframe")).toHaveCount(2);
  await page.getByLabel("Animated property", { exact: true }).selectOption("xPx");
  await page.getByLabel("Animated value", { exact: true }).fill("200"); await page.getByLabel("Animated value", { exact: true }).press("Tab");
  await expect(page.locator(".map-keyframe")).toHaveCount(3);
  await openOutputProperties(page);
  const number = async (label: string, value: string) => { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press("Tab"); };
  await number("Crop left", "300"); await number("Crop top", "100"); await number("Crop width", "800"); await number("Crop height", "600");
  await page.getByLabel("Output fit", { exact: true }).selectOption("contain");
  await expect(page.getByRole("button", { name: "Move output region" })).toBeVisible();
  await expect.poll(() => output.locator(".map-output-raster").evaluate((el) => (el as HTMLElement).style.clipPath)).toContain("300px 100px");
  const box = (await page.getByRole("button", { name: "Move output region" }).boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 55, box.y + 30, { steps: 5 }); await page.mouse.up();
  await expect(page.getByLabel("Crop left", { exact: true })).not.toHaveValue("300");
  await clickRibbon(page, "Blackout"); await expect(output.locator(".map-surface")).toHaveCount(0);
  await clickRibbon(page, "Blackout"); await expect(output.locator(".map-surface")).toHaveCount(1);
  await saveShow(page, "Animated cropped scene"); await page.reload();
  await openTimeline(page);
  await page.getByRole("tree", { name: "Layers", exact: true }).locator('[role=treeitem][aria-level="2"]').first().click();
  await expect(page.locator(".map-keyframe")).toHaveCount(3);
  await openOutputProperties(page);
  await expect(page.getByRole("button", { name: "Move output region" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("animation-crop-workspace.png") });
  await output.close();
});
