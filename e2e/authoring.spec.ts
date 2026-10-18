import { expect, test } from "@playwright/test";
import { command, openOutput, openOutputProperties, saveShow, signIn, solidPng, clickRibbon, switchWorkspace, documentCommand, openShowMedia, openTimeline } from "./helpers";

test("scene setup photo is editable, saved, scene-specific and absent from projection", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const picker = page.waitForEvent("filechooser");
  await clickRibbon(page, "Import backdrop");
  await (await picker).setFiles({
    name: "wall-reference.png", mimeType: "image/png", buffer: solidPng(320, 180, [20, 130, 180]),
  });
  const background = page.getByRole("img", { name: "Backdrop", exact: true });
  await expect(background).toBeVisible();
  const layers = page.getByRole("tree", { name: "Layers", exact: true });
  const backgroundRow = layers.getByRole("treeitem").filter({ hasText: "Backdrop — wall-reference.png" });
  await expect(backgroundRow).toHaveAttribute("aria-selected", "true");
  await expect(backgroundRow.getByRole("img", { name: "Editor only — excluded from projection" })).toBeVisible();
  // Mapping keeps its canvas for geometry; the input preview belongs to Visualization.
  await expect(page.locator(".map-input-preview")).toHaveCount(0);
  const properties = page.getByRole("region", { name: "Backdrop layer properties" });
  await properties.getByRole("slider", { name: "Backdrop opacity" }).fill("35");
  await expect(background).toHaveCSS("opacity", "0.35");
  await expect(await command(page, "Layer controls", "Move layer forward")).toBeDisabled();
  await expect(await command(page, "Layer controls", "Move layer backward")).toBeDisabled();
  await page.keyboard.press("Escape");
  await backgroundRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide backdrop", exact: true }).click();
  await expect(background).toHaveCount(0);
  await backgroundRow.getByRole("button", { name: "Show backdrop", exact: true }).click();
  await expect(background).toBeVisible();
  await clickRibbon(page, "New Surface");
  await expect(layers.getByRole("treeitem").last()).toContainText("Backdrop — wall-reference.png");
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await expect(output.locator("img")).toHaveCount(0);

  await backgroundRow.click();
  await backgroundRow.press("Delete");
  await expect(backgroundRow).toHaveCount(0);
  await expect(background).toHaveCount(0);
  await expect(layers.locator('[role=treeitem][aria-level="2"]')).toHaveCount(1);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await documentCommand(page, "Undo");
  await expect(backgroundRow).toBeVisible();
  await expect(background).toHaveCSS("opacity", "0.35");
  await backgroundRow.dblclick();
  const window = page.getByRole("region", { name: "Selection properties" });
  await window.getByRole("slider", { name: "Backdrop opacity" }).fill("75");
  await documentCommand(page, "Undo");
  await expect(background).toHaveCSS("opacity", "0.35");
  await (await command(page, "Layer controls", "Layer properties")).click();
  await window.getByRole("slider", { name: "Backdrop opacity" }).fill("50");
  await expect(page.locator(".aui-feature-window")).toHaveCount(0);
  await expect(background).toHaveCSS("opacity", "0.5");
  await documentCommand(page, "Undo");
  await expect(background).toHaveCSS("opacity", "0.35");

  await page.getByRole("button", { name: "New scene", exact: true }).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".map-artboard.is-active .map-setup-background")).toHaveCount(0);
  await expect(background).toBeVisible();
  // The backdrop is Scene 1's and still listed under Scene 1 — the one tree
  // shows every scene's contents. That the *new* scene has none is the canvas
  // assertion above, which is what "absent from this scene" actually means.
  await expect(backgroundRow).toHaveCount(1);
  // Editing another scene cannot silently switch a live output: its scene
  // binding is explicit and stays on Scene 1 until the operator changes it.
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: /Scene 1/ }).first().click();
  await expect(background).toBeVisible();
  await expect(backgroundRow).toBeVisible();
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await saveShow(page, "Setup reference workflow");
  await page.reload();
  await expect(background).toBeVisible();
  await expect(background).toHaveCSS("opacity", "0.35");
  // Last of its scene's contents, not of the whole tree — a second scene now
  // follows Scene 1 in the same tree.
  await expect(layers.locator('[role=treeitem][aria-level="2"]').last()).toContainText("Backdrop — wall-reference.png");
  await backgroundRow.click();
  await expect(properties).toBeVisible();
  // The editor now fits both scene artboards side by side. The active one
  // remains substantial and visible, but need not fill 80% of the viewport.
  await expect.poll(async () => {
    const raster = (await page.locator(".map-raster.is-active").boundingBox())!;
    const canvas = (await page.locator(".map-canvas-host").boundingBox())!;
    return Math.max(raster.width / canvas.width, raster.height / canvas.height);
  }).toBeGreaterThan(0.3);
  await page.screenshot({ path: info.outputPath("scene-setup.png") });
  await output.screenshot({ path: info.outputPath("projection-without-reference.png") });
});

test("two shows keep monitor, Cast and AirPlay output separate and clean", async ({ page, context, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "New Surface");
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  const second = await context.newPage();
  await second.goto("/map/index.html?new=show");
  await clickRibbon(second, "New Surface");
  await clickRibbon(second, "New Surface");
  const secondOutput = await openOutput(second);
  await expect(secondOutput.locator(".map-surface")).toHaveCount(2);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  expect(new URL(output.url()).searchParams.get("session")).not.toBe(new URL(secondOutput.url()).searchParams.get("session"));

  // Cast and AirPlay are the output's device, alongside Monitor and Edge.
  await openOutputProperties(page);
  await page.getByRole("radio", { name: "Wireless" }).click();
  let wireless = output;
  for (const name of ["Open Cast output tab", "Open AirPlay output window"]) {
    // One output, one device: moving it closes the window it was playing on
    // and opens the new one, rather than leaving both running the show.
    const closed = wireless.waitForEvent("close");
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name }).click();
    await closed;
    wireless = await popup;
    await expect(wireless.locator(".map-surface")).toHaveCount(1);
    await expect(wireless.locator(".map-output-hint, .map-output-crop, .map-overlay, .map-setup-background")).toHaveCount(0);
    const raster = (await wireless.locator(".map-raster").boundingBox())!;
    const viewport = await wireless.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(raster.x).toBeGreaterThanOrEqual(-0.5);
    expect(raster.y).toBeGreaterThanOrEqual(-0.5);
    expect(raster.x + raster.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(raster.y + raster.height).toBeLessThanOrEqual(viewport.height + 0.5);
    await wireless.reload();
    await expect(wireless.locator(".map-surface")).toHaveCount(1);
  }
  await clickRibbon(page, "New Surface");
  // The AirPlay window is this show's output now; the other show's is untouched.
  await expect(wireless.locator(".map-surface")).toHaveCount(2);
  await expect(secondOutput.locator(".map-surface")).toHaveCount(2);
});

test("move and trim timeline clips, protect their media, and project only inside the clip", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "New Surface");
  await page.locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles({
    name: "clip-image.png", mimeType: "image/png", buffer: solidPng(320, 180, [240, 80, 120]),
  });
  await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-surface img")).toBeVisible();
  const output = await openOutput(page);
  await openTimeline(page);
  await page.getByRole("tab", { name: "Surface 1", exact: true }).click();
  await openShowMedia(page);
  const pool = page.getByRole("region", { name: "Media Pool", exact: true });
  await pool.getByRole("button", { name: "clip-image.png", exact: true }).click();
  await expect(pool.getByRole("button", { name: "Remove from pool", exact: true })).toBeDisabled();
  const ruler = (await page.locator(".map-ruler").boundingBox())!;
  const pxPerS = ruler.width / 60;
  const clip = page.locator(".map-clip");
  const before = (await clip.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 20 * pxPerS, before.y + before.height / 2, { steps: 10 });
  await page.mouse.up();
  expect((await clip.boundingBox())!.x).toBeCloseTo(before.x + 20 * pxPerS, 0);
  const end = (await page.locator(".map-clip-edge--end").boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2 - 4 * pxPerS, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();
  expect((await clip.boundingBox())!.width).toBeLessThan(before.width - 3 * pxPerS);
  for (const [at, count] of [[15, 0], [23, 1], [48, 0]]) {
    await page.mouse.click(ruler.x + at * pxPerS, ruler.y + ruler.height / 2);
    await expect(page.getByRole("region", { name: "Scene output preview", exact: true }).locator(".map-surface img")).toHaveCount(count);
    await expect(output.locator(".map-surface img")).toHaveCount(count);
  }
  await saveShow(page, "Clip move and trim workflow");
  await page.reload();
  await openTimeline(page);
  await expect(clip).toHaveCount(1);
});
