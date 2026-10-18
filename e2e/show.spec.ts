import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { solidPng, signIn, clickRibbon, openOutputProperties, openPanel, openTimeline, switchWorkspace, documentCommand, openShowMedia } from "./helpers";

/**
 * The whole job, in the real browser, against the production build:
 * create a map, put an asset on a surface, save it, open the output window,
 * and see the same picture there — then move a corner and watch the output
 * follow. This is what a demo is.
 */

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "screenshots");

const surfaceTransform = (page: Page) =>
  page.locator(".map-surface img").first().evaluate((el) => (el as HTMLElement).style.transform);

test("create a map, render an asset on it, and preview it on the output window", async ({
  page,
  context,
  baseURL,
}) => {
  mkdirSync(SHOTS, { recursive: true });
  const fixture = join(SHOTS, "fixture.png");
  writeFileSync(fixture, solidPng(320, 180, [255, 64, 160]));

  await signIn(page, baseURL!);

  // --- The library home is the front door ----------------------------------
  await page.goto("/map/");
  await expect(page).toHaveTitle("Aether Map");
  await expect(page.getByText("Create a show", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "1-library-home.png") });

  // --- A new map ----------------------------------------------------------
  await page.goto("/map/index.html?new=show&scope=personal");
  await expect(page).toHaveTitle("Aether Map");
  // A new show is one scene with nothing under it. There is no "no surfaces
  // yet" placeholder any more: scenes are the tree's roots, so emptiness reads
  // as a scene row with no children rather than an empty tree.
  await expect(page.getByRole("tree", { name: "Layers", exact: true })
    .locator('[role=treeitem][aria-level="2"]')).toHaveCount(0);

  // --- A surface, with an asset on it --------------------------------------
  await clickRibbon(page, "New Surface");
  await expect(page.getByText("Surface 1").first()).toBeVisible();
  // The empty surface shows a checkerboard so the warp is visible before media.
  await expect(page.locator(".map-surface-grid").first()).toBeVisible();

  await page.locator('input[type=file][accept="image/*,video/*"]').setInputFiles(fixture);
  await switchWorkspace(page, "Visualization");
  const image = page.locator(".map-surface img").first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /\/api\/map\/media\/.+\.png$/);
  const editorTransform = await surfaceTransform(page);
  expect(editorTransform).toMatch(/^matrix3d\(/);
  await page.screenshot({ path: join(SHOTS, "2-asset-on-surface.png") });

  // --- Save ----------------------------------------------------------------
  await documentCommand(page, "Save show");
  const nameField = page.getByRole("dialog").getByRole("textbox");
  await nameField.fill("E2E Porch");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  // Saving is continuous now, so the tab row reads "Saved" from the first frame
  // and proves nothing. The name reaching the tab, and the document id
  // reaching the URL, are what say the show is really in the library.
  await expect(page.getByRole("tab", { name: "E2E Porch", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/[?&]document=/, { timeout: 15_000 });

  // --- Output on this machine ---------------------------------------------
  await clickRibbon(page, "Output");
  // A local output window opens without enumerating or guessing displays.
  await expect(page.getByRole("dialog").locator("select")).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText("No output window connected", { exact: true })).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("dialog").getByRole("button", { name: "Open output window" }).click();
  const output = await popupPromise;
  await output.waitForLoadState();
  await expect(output).toHaveTitle("Aether Map — Output");

  const outputImage = output.locator(".map-surface img").first();
  await expect(outputImage).toBeVisible();
  // Same asset, same warp: the projector shows exactly what the editor shows.
  await expect(outputImage).toHaveAttribute("src", /\/api\/map\/media\/.+\.png$/);
  await expect
    .poll(() => surfaceTransform(output), { timeout: 5_000 })
    .toBe(editorTransform);
  // No editing chrome on the projector.
  await expect(output.locator(".map-handle")).toHaveCount(0);
  await expect(output.locator(".map-zoom")).toHaveCount(0);
  await output.screenshot({ path: join(SHOTS, "3-output-window.png") });

  // --- Move a corner; the output follows live ------------------------------
  // Corner handles belong to the Node tool; Select drags the whole surface.
  await clickRibbon(page, "Node");
  const handle = page.locator(".map-handle").first();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60, { steps: 8 });
  await page.mouse.up();

  await switchWorkspace(page, "Visualization");
  const movedTransform = await surfaceTransform(page);
  expect(movedTransform).not.toBe(editorTransform);
  await expect
    .poll(() => surfaceTransform(output), { timeout: 5_000 })
    .toBe(movedTransform);
  await page.screenshot({ path: join(SHOTS, "4-editor-after-drag.png") });
  await output.screenshot({ path: join(SHOTS, "5-output-after-drag.png") });

  // --- Sketch a profile; it becomes a second surface, on both ---------------
  await clickRibbon(page, "Ellipse");
  const raster = page.locator(".map-raster");
  const rasterBox = (await raster.boundingBox())!;
  await page.mouse.move(rasterBox.x + rasterBox.width * 0.6, rasterBox.y + rasterBox.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(rasterBox.x + rasterBox.width * 0.9, rasterBox.y + rasterBox.height * 0.9, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.locator(".map-surface")).toHaveCount(2);
  await expect(page.locator(".map-mask-outline")).toHaveCount(1);
  await expect(page.getByText("Surface 2").first()).toBeVisible();
  // The projector has the same two surfaces, the second clipped to the ellipse.
  await expect(output.locator(".map-surface")).toHaveCount(2, { timeout: 5_000 });
  await expect
    .poll(
      () => output.locator(".map-surface").nth(1).evaluate((el) => (el as HTMLElement).style.clipPath),
      { timeout: 5_000 },
    )
    .toMatch(/^polygon\(/);
  await page.screenshot({ path: join(SHOTS, "7-profile-drawn.png") });
  await output.screenshot({ path: join(SHOTS, "8-output-two-surfaces.png") });
  await switchWorkspace(page, "Visualization");
  // Back to Select before touching anything else, then reselect the first.
  await page.keyboard.press("Escape");
  // The layer row, not the timeline track of the same name.
  await page.getByRole("tree", { name: "Layers", exact: true }).getByRole("treeitem").filter({ hasText: "Surface 1" }).click();
  // The shell mounts panel content in more than one host, so assert on the
  // selected row itself rather than on whichever name field comes first.
  await expect(page.getByRole("tree", { name: "Layers", exact: true }).locator('[role="treeitem"][aria-selected="true"]', { hasText: "Surface 1" })).toBeVisible();

  // --- A cue hides the surface on both -------------------------------------
  // Cues live on the timeline, and the tray opens on Surfaces now.
  await openTimeline(page);
  // Exact: the Layers panel also has "Hide Surface 2", an eye toggle, which
  // a loose match found first — and which is not a cue at all.
  await page.getByRole("button", { name: "Hide", exact: true }).first().click();
  await expect(page.locator(".map-surface img")).toHaveCount(0);
  await expect(output.locator(".map-surface img")).toHaveCount(0, { timeout: 5_000 });
  await documentCommand(page, "Undo");
  await expect(page.locator(".map-surface img").first()).toBeVisible();
  await expect(output.locator(".map-surface img").first()).toBeVisible({ timeout: 5_000 });

  // --- Outputs: the live link is listed; its device is a property of it ------
  await openPanel(page, "Outputs");
  const outputRow = page.getByRole("tree", { name: "Outputs", exact: true }).getByRole("treeitem").first();
  // The link badge is an icon with a label, not text in the row.
  await expect(outputRow.getByRole("img", { name: /^Connected/ })).toBeVisible();
  await openOutputProperties(page);

  // Monitor is today's device and an edge player is the other; both are
  // properties of the output rather than a panel to reconcile by hand.
  await expect(page.getByRole("radio", { name: "Monitor" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Edge device" }).click();
  await expect(page.getByLabel("Edge device for this output")).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "9-devices-edge.png") });
  await page.getByRole("radio", { name: "Monitor" }).click();

  // --- Sequence room: place the asset on the layer, scrub past it ------------
  await openTimeline(page);
  await page.locator(".map-track-head", { hasText: "Surface 1" }).click();
  // Assigning the media already laid a clip on the layer; Place adds another at
  // the playhead, which is what a sequencer is for.
  await expect(page.locator(".map-clip")).toHaveCount(1);
  await openShowMedia(page);
  await page.getByRole("combobox", { name: "Content action", exact: true }).selectOption("append");
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await expect(page.locator(".map-clip")).toHaveCount(2);
  await expect(page.locator(".map-clip").first()).toHaveAttribute("title", /fixture\.png/);

  // Take the second clip away again so the back half of the scene is bare.
  await page.locator(".map-clip").nth(1).click();
  await page.getByRole("button", { name: "Remove clip" }).click();
  await expect(page.locator(".map-clip")).toHaveCount(1);

  // The remaining clip covers the first half of a 60 s scene. At 45 s the layer
  // is empty, in the editor and on the projector; at 15 s it is back.
  const ruler = page.locator(".map-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.click(rulerBox.x + rulerBox.width * (45 / 60), rulerBox.y + rulerBox.height / 2);
  await expect(page.locator(".map-surface img")).toHaveCount(0);
  await expect(output.locator(".map-surface img")).toHaveCount(0, { timeout: 5_000 });
  await page.screenshot({ path: join(SHOTS, "10-sequence-gap.png") });
  await page.mouse.click(rulerBox.x + rulerBox.width * (15 / 60), rulerBox.y + rulerBox.height / 2);
  await expect(page.locator(".map-surface img").first()).toBeVisible();
  await expect(output.locator(".map-surface img").first()).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: join(SHOTS, "11-sequence-clip.png") });
  await switchWorkspace(page, "Mapping");

  // --- It is in the library and reopens intact -----------------------------
  await documentCommand(page, "Save show");
  // Continuous saving: wait for the flush to land before navigating away.
  await expect(page.getByRole("status", { name: "Autosave is always on." })).toHaveText("Saved", {
    timeout: 15_000,
  });
  const url = page.url();
  await page.goto("/map/");
  // Home lists recent work; a show just saved counts as recent.
  await expect(page.getByText("E2E Porch.aethermap").first()).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "6-library-with-show.png") });
  // And it lives under My files regardless.
  await page.getByText("My files").first().click();
  await expect(page.getByText("E2E Porch.aethermap").first()).toBeVisible();
  await page.goto(url);
  await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-surface img").first()).toBeVisible();
  await expect.poll(() => surfaceTransform(page)).toBe(movedTransform);
});
