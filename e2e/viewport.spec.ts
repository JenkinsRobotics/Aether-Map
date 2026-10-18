import { expect, test, type Page } from "@playwright/test";
import { openPanel, clickRibbon, signIn } from "./helpers";

/**
 * Where you put the canvas is yours. Editing a surface must not move it.
 *
 * The bug: `bounds` was recomputed from `show`, so every edit gave it a new
 * identity, which gave `fit` a new identity, which re-ran the resize-observer
 * effect — and that effect re-armed auto-fit and refitted. Pan somewhere, nudge
 * a corner, and the view jumped back to the default.
 */

// `.map-artboards` carries the pan/zoom; the rasters live inside it.
const transform = (page: Page) =>
  page.locator(".map-artboards").first().evaluate((el) => getComputedStyle(el).transform);

async function panTo(page: Page, dx: number, dy: number) {
  const host = page.locator(".map-canvas-host").first();
  const box = (await host.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Canvas gestures start with canvas focus, not a panel button.
  await host.focus();
  // Space is the canvas grab modifier.
  await page.keyboard.down("Space");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
}

test("the canvas stays where it was put while surfaces are edited", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "New Surface");

  await openPanel(page, "Transform");
  const fitted = await transform(page);
  await panTo(page, -160, -90);
  const moved = await transform(page);
  expect(moved).not.toBe("none");
  expect(moved).not.toBe(fitted);

  // Editing the document must not touch the view.
  const properties = page.getByRole("region", { name: "Backdrop layer properties" });
  await expect(properties).toHaveCount(0);
  // The first row is the scene; the layer is the first row beneath it.
  await page.getByRole("tree", { name: "Layers", exact: true })
    .locator('[role=treeitem][aria-level="2"]').first().click();
  const width = page.getByRole("textbox", { name: "Layer Width", exact: true });
  await width.fill("500");
  await width.press("Enter");
  await expect.poll(() => transform(page), { timeout: 3_000 }).toBe(moved);

  // Nudging geometry is the same promise, and it is the edit you make most.
  await clickRibbon(page, "Node");
  const handle = page.locator(".map-handle").first();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 25, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => transform(page), { timeout: 3_000 }).toBe(moved);

  // Adding a surface does not reclaim the view either.
  await clickRibbon(page, "New Surface");
  await expect.poll(() => transform(page), { timeout: 3_000 }).toBe(moved);

  // Fit is still how you ask for the default back.
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect.poll(() => transform(page), { timeout: 3_000 }).not.toBe(moved);
});
