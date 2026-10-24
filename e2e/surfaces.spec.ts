import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, command, signIn, openBottomDock } from "./helpers";

/**
 * The Surfaces workspace: the scene's surfaces as one row of cells you pick
 * from, each drawing the whole scene with its own surface lit up. The Layers
 * tree lists names; this answers the question you ask facing a wall — which
 * shape is that one?
 */

const strip = (page: Page) => page.locator(".map-surfaces");
// The tiles themselves, never the add button beside them.
const cells = (page: Page) => strip(page).locator(".map-surface-cell");
const layers = (page: Page) => page.getByRole("tree", { name: "Layers", exact: true });

async function newSurface(page: Page) {
  await clickRibbon(page, "New Surface");
}

test("the Surfaces strip draws every surface in the scene and picks one", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");

  // An empty scene is an empty row, not a different panel: the tray keeps its
  // height and its arrangement so it can be learned, and the add button is
  // where it always is.
  await openBottomDock(page, "Surfaces");
  await expect(cells(page)).toHaveCount(0);
  await expect(strip(page).getByRole("button", { name: "New surface" })).toBeVisible();
  // The add button opens the shape sheet: adding a surface means choosing what
  // shape it is, and choosing arms that shape's tool to be drawn with.
  await strip(page).getByRole("button", { name: "New surface" }).click();
  await page.getByRole("dialog", { name: "Add Shape" }).getByRole("button", { name: "Square" }).click();
  const raster = page.locator(".map-raster");
  const area = (await raster.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.62, { steps: 6 });
  await page.mouse.up();
  await expect(cells(page)).toHaveCount(1);

  await newSurface(page);
  await newSurface(page);
  await expect(cells(page)).toHaveCount(3);
  await expect(cells(page).nth(0)).toHaveAccessibleName("Square 1");
  await expect(cells(page).nth(2)).toHaveAccessibleName("Surface 3");

  // Each cell draws the whole scene, so the row reads as this room rather than
  // as shapes floating in nothing — and marks out the one it stands for.
  const firstCell = cells(page).nth(0);
  await expect(firstCell.locator(".map-surface-cell-subject")).toHaveCount(1);
  await expect(firstCell.locator(".map-surface-cell-other")).toHaveCount(2);
  // The scene's own bounds are deliberately not drawn: the cell already has an
  // edge, and a rectangle just inside it read as a border around a border.
  await expect(firstCell.locator(".map-surface-cell-bounds")).toHaveCount(0);

  // Picking a cell is the selection the rest of the editor already has: one
  // selection, not two views disagreeing about it.
  await firstCell.click();
  await expect(firstCell).toHaveAttribute("aria-current", "true");
  await expect(layers(page).locator('[role="treeitem"][aria-selected="true"]')).toHaveText(/Square 1/);
  await expect(cells(page).nth(2)).not.toHaveAttribute("aria-current", "true");

  // And it goes the other way: selecting in the tree moves the strip.
  await layers(page).getByRole("treeitem").filter({ hasText: "Surface 3" }).click();
  await expect(cells(page).nth(2)).toHaveAttribute("aria-current", "true");
  await expect(firstCell).not.toHaveAttribute("aria-current", "true");
  await page.screenshot({ path: info.outputPath("surfaces-strip.png") });
});

test("a hidden surface still has a cell, and says it is hidden", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await newSurface(page);
  await newSurface(page);
  await openBottomDock(page, "Surfaces");
  await expect(cells(page)).toHaveCount(2);

  // Hiding is a Layers command; the strip has to agree with it, because a
  // surface you cannot see is exactly the one you go looking for.
  const row = layers(page).getByRole("treeitem").filter({ hasText: "Surface 2" });
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide", exact: true }).click();
  await expect(cells(page).nth(1)).toHaveAccessibleName("Surface 2, hidden");
  await expect(cells(page).nth(1)).toHaveClass(/is-hidden/);
  // It is still drawn in its own cell — hidden is not gone.
  await expect(cells(page).nth(1).locator(".map-surface-cell-subject")).toHaveCount(1);
  // But it is not drawn as context in the other cell, which shows what projects.
  await expect(cells(page).nth(0).locator(".map-surface-cell-other")).toHaveCount(0);
});

test("the strip follows the active scene", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await newSurface(page);
  await openBottomDock(page, "Surfaces");
  await expect(cells(page)).toHaveCount(1);

  // A second scene is its own room with its own surfaces.
  await (await command(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true })
    .getByRole("button", { name: "Create", exact: true }).click();
  await expect(cells(page)).toHaveCount(0);
  await expect(strip(page).getByRole("button", { name: "New surface" })).toBeVisible();

  await page.getByRole("tree", { name: "Layers", exact: true })
    .getByRole("treeitem", { name: /Scene 1/ }).first().click();
  await expect(cells(page)).toHaveCount(1);
});

test("tiles grow with the tray, up to the point where a strip stops being one", async ({
  page,
  baseURL,
}) => {
  // Dragging the tray taller is how you ask to see the room better; a fixed
  // tile height answered that with more empty space.
  await signIn(page, baseURL!);
  const heightOf = async (tray: number) => {
    await page.addInitScript((value) => {
      localStorage.setItem("aether-map.timeline-height.surfaces", String(value));
    }, tray);
    await page.goto("/map/index.html?new=show");
    await newSurface(page);
    await openBottomDock(page, "Surfaces");
    const box = (await cells(page).first().boundingBox())!;
    return { width: Math.round(box.width), height: Math.round(box.height) };
  };

  const small = await heightOf(72);
  const medium = await heightOf(150);
  expect(medium.height).toBeGreaterThan(small.height);
  // The artboard's aspect ratio is the tile's, so width follows height and the
  // tile keeps saying where a surface sits rather than distorting it.
  expect(medium.width / medium.height).toBeCloseTo(small.width / small.height, 1);

  // But it stops: at full height two tiles filled the window and the third was
  // off the edge, which is a worse way to find a surface than a small tile.
  const huge = await heightOf(400);
  expect(huge.height).toBeLessThanOrEqual(160);
  expect(huge.height).toBeGreaterThanOrEqual(medium.height);
});
