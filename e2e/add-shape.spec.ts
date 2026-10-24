import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, openOutput, openPanel, signIn, solidPng } from "./helpers";

const alphaPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP4z8DAgA/jlURX8B8ND4QC8nwBAGHnT7EZapMkAAAAAElFTkSuQmCC", "base64");

const sheet = (page: Page) => page.getByRole("dialog", { name: "Add Shape" });
const layers = (page: Page) => page.getByRole("tree", { name: "Layers", exact: true });
const openSheet = async (page: Page) => {
  await page.locator(".map-surfaces-add").click();
  await expect(sheet(page)).toBeVisible();
};

test("the add sheet offers every shape the mapping workspace can make", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await openSheet(page);

  for (const label of ["Square", "Circle", "Text", "Outline", "Cube", "Box"]) {
    await expect(sheet(page).getByRole("button", { name: label, exact: true })).toBeEnabled();
  }
  for (const label of [/Transparent PNG/, /Import backdrop/]) {
    await expect(sheet(page).getByRole("button", { name: label })).toBeEnabled();
  }
  // The smart tools are shown and disabled: a row saying "not yet" is more
  // honest than a gap that looks like nobody considered it.
  for (const label of [/Smart Shape Detection/, /AI Generation/]) {
    await expect(sheet(page).getByRole("button", { name: label })).toBeDisabled();
  }
});

test("a cube arrives as one grouped object, not three loose faces", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Cube", exact: true }).click();
  await expect(sheet(page)).toBeHidden();

  // One folder row in the tree, holding the three faces.
  await openPanel(page, "Layers");
  await expect(layers(page).getByRole("treeitem", { name: /^Cube/ }).first()).toBeVisible();
  await expect(layers(page).getByRole("treeitem", { name: /^Collapse Cube/ }).locator('svg[data-icon="cube"]')).toHaveCount(1);
  await expect(layers(page).getByRole("button", { name: /^(Expand|Collapse) Cube/ })).toHaveCount(1);
  // And three cells in the surfaces strip, one per face.
  await expect(page.locator(".map-surface-cell")).toHaveCount(3);
  await expect(page.locator(".map-group-bounds")).toHaveCount(1);
  await page.locator(".map-surface-cell").first().click();
  // The near corner belongs to all three faces. Warping it on the selected
  // top face must carry the left and right faces with it.
  const corner = async (face: number, vertex: number) => {
    const points = (await page.locator(".map-outline").nth(face).getAttribute("points"))!;
    return points.split(" ")[vertex].split(",").map(Number);
  };
  const before = await corner(0, 2);
  await clickRibbon(page, "Node");
  const handle = (await page.locator(".map-handle").nth(2).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 18, handle.y + handle.height / 2 + 12, { steps: 5 });
  await page.mouse.up();
  const after = await corner(0, 2);
  expect(after).not.toEqual(before);
  expect(await corner(1, 1)).toEqual(after);
  expect(await corner(2, 0)).toEqual(after);
  for (let face = 0; face < 3; face++) {
    await page.locator(".map-surface-cell").nth(face).click();
    await expect(page.locator(".map-surface-cell").nth(face)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".map-outline.is-selected")).toHaveCount(1);
  }

  // A box is five faces in its own folder, alongside the cube's.
  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Box", exact: true }).click();
  await expect(page.locator(".map-surface-cell")).toHaveCount(8);
  await expect(layers(page).getByRole("button", { name: /^(Expand|Collapse) (Cube|Box)/ })).toHaveCount(2);
  await expect(layers(page).getByRole("treeitem", { name: /^Collapse Box/ }).locator('svg[data-icon="box"]')).toHaveCount(1);

  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Cube", exact: true }).click();
  await expect(page.locator(".map-surface-cell")).toHaveCount(11);
  await expect(layers(page).getByRole("treeitem", { name: /^Cube 2/ }).first()).toBeVisible();
  await page.locator(".map-surface-cell").nth(2).click();
  await expect(page.locator(".map-surface-cell").nth(2)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".map-surface-cell").nth(1)).not.toHaveAttribute("aria-current", "true");
  await page.getByRole("group", { name: "Layer controls" }).getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Rename Folder 1" }).press("Enter");
  await expect(layers(page).getByRole("treeitem", { name: /^Folder 1/ })
    .locator('svg[data-icon="collection-folder"]')).toHaveCount(1);
});

test("a compound selects as a whole first, then drills into a movable face", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Box", exact: true }).click();
  const outlines = page.locator(".map-outline");
  await expect(outlines).toHaveCount(5);
  await expect(page.locator(".map-group-bounds")).toHaveCount(1);
  await expect(page.locator(".map-outline.is-selected")).toHaveCount(5);
  await expect(page.locator(".map-resize-handle")).toHaveCount(8);
  await expect(page.locator(".map-rotate-handle")).toHaveCount(1);

  const points = async (index: number) => (await outlines.nth(index).getAttribute("points"))!
    .split(" ").map(point => point.split(",").map(Number));
  const before = await Promise.all(Array.from({ length: 5 }, (_, index) => points(index)));
  const raster = (await page.locator(".map-raster.is-active").boundingBox())!;
  const clickPoint = (point: number[]) => ({
    x: raster.x + point[0] / 1920 * raster.width,
    y: raster.y + point[1] / 1080 * raster.height,
  });
  const back = before[0];
  const center = clickPoint([
    back.reduce((sum, point) => sum + point[0], 0) / back.length,
    back.reduce((sum, point) => sum + point[1], 0) / back.length,
  ]);
  // A blank click clears selection. The first hit selects the box, the next
  // selects the face. A group row in the Layers tree selects the whole box too.
  await page.mouse.click(raster.x + 10, raster.y + 10);
  await expect(page.locator(".map-group-bounds")).toHaveCount(0);
  await page.mouse.click(center.x, center.y);
  await expect(page.locator(".map-group-bounds")).toHaveCount(1);
  await page.mouse.click(center.x, center.y);
  await expect(page.locator(".map-group-bounds")).toHaveCount(0);
  await expect(page.locator(".map-outline.is-selected")).toHaveCount(1);
  await expect(page.locator(".map-resize-handle")).toHaveCount(8);
  await openPanel(page, "Layers");
  await layers(page).getByRole("treeitem", { name: /^Collapse Box/ }).click();
  await expect(page.locator(".map-group-bounds")).toHaveCount(1);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 55, center.y + 35, { steps: 6 });
  await page.mouse.up();
  const moved = await Promise.all(Array.from({ length: 5 }, (_, index) => points(index)));
  const dx = moved[0][0][0] - before[0][0][0], dy = moved[0][0][1] - before[0][0][1];
  expect(Math.abs(dx)).toBeGreaterThan(20);
  expect(Math.abs(dy)).toBeGreaterThan(10);
  for (let face = 0; face < 5; face++) for (let corner = 0; corner < 4; corner++) {
    expect(moved[face][corner][0] - before[face][corner][0]).toBeCloseTo(dx, 0);
    expect(moved[face][corner][1] - before[face][corner][1]).toBeCloseTo(dy, 0);
  }
  await page.keyboard.press("Meta+z");
  await expect.poll(() => points(0)).toEqual(before[0]);
  for (let face = 1; face < 5; face++) expect(await points(face)).toEqual(before[face]);

  // The group's standard southeast handle scales all five faces through one
  // frame and retains the shared back/wall vertices.
  const frameBefore = page.locator(".map-group-bounds");
  const widthBefore = Number(await frameBefore.getAttribute("width"));
  const heightBefore = Number(await frameBefore.getAttribute("height"));
  const resize = (await page.getByLabel("Resize se").boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 55, resize.y + resize.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await frameBefore.getAttribute("width"))).toBeGreaterThan(widthBefore);
  await expect.poll(async () => Number(await frameBefore.getAttribute("height"))).toBeGreaterThan(heightBefore);
  expect((await points(0))[0]).toEqual((await points(1))[3]);
  expect((await points(0))[0]).toEqual((await points(4))[1]);
  await page.keyboard.press("Meta+z");
  await expect.poll(() => points(0)).toEqual(before[0]);

  await page.keyboard.press("ArrowRight");
  for (let face = 0; face < 5; face++) {
    const nudged = await points(face);
    expect(nudged[0][0]).toBeCloseTo(before[face][0][0] + 1, 0);
  }
  await page.keyboard.press("Meta+z");
  await expect.poll(() => points(0)).toEqual(before[0]);

  // Selecting a face directly still lets it move without translating the box.
  await layers(page).getByRole("treeitem", { name: /^Box back/ }).first().click();
  await expect(page.locator(".map-group-bounds")).toHaveCount(0);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 40, center.y + 20, { steps: 5 });
  await page.mouse.up();
  expect(await points(0)).not.toEqual(before[0]);
  expect((await points(2))[2]).toEqual(before[2][2]);
});

test("Square and Circle place equal-axis surfaces; Transparent PNG creates a separate image plane", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await expect(page.locator(".map-raster.is-active")).toBeVisible();
  await expect(page.locator(".map-save-state")).toHaveText("Saved");
  const draw = async (offset: number) => {
    const raster = (await page.locator(".map-raster.is-active").boundingBox())!;
    await page.mouse.move(raster.x + raster.width * offset, raster.y + raster.height * offset);
    await page.mouse.down();
    await page.mouse.move(raster.x + raster.width * (offset + .15), raster.y + raster.height * (offset + .09), { steps: 5 });
    await expect(page.locator(".map-draft polygon")).toHaveCount(1);
    await page.mouse.up();
  };
  for (const [index, label] of ["Square", "Circle"].entries()) {
    await openSheet(page);
    await sheet(page).getByRole("button", { name: label, exact: true }).click();
    await draw(index === 0 ? .2 : .55);
    await expect(page.locator(".map-surface-cell")).toHaveCount(index + 1);
  }
  await expect(page.locator(".map-surface-cell")).toHaveCount(2);
  await expect(page.locator(".map-surface-cell").nth(0)).toHaveAccessibleName("Square 1");
  await expect(page.locator(".map-surface-cell").nth(1)).toHaveAccessibleName("Circle 2");
  await page.locator(".map-surface-cell").nth(0).click();
  const picked = page.waitForEvent("filechooser");
  await openSheet(page);
  await sheet(page).getByRole("button", { name: /Transparent PNG/ }).click();
  const chooser = await picked;
  expect(await (await chooser.element()).evaluate(input => input.getAttribute("accept"))).toMatch(/image\/png/);
  await chooser.setFiles({ name: "transparent.png", mimeType: "image/png", buffer: alphaPng });
  await expect(page.locator(".map-surface-cell")).toHaveCount(3);
  await expect(page.locator(".map-surface-cell").nth(2)).toHaveAccessibleName("transparent.png");

  const bad = page.waitForEvent("filechooser");
  await openSheet(page);
  await sheet(page).getByRole("button", { name: /Transparent PNG/ }).click();
  await (await bad).setFiles({ name: "opaque.png", mimeType: "image/png", buffer: solidPng(8, 8, [255, 0, 0]) });
  await expect(page.getByText("Choose a PNG with transparency for Transparent PNG.")).toBeVisible();
  await expect(page.locator(".map-surface-cell")).toHaveCount(3);

  await expect(page.locator(".map-save-state")).toHaveText("Saved");
  const id = new URL(page.url()).searchParams.get("document")!;
  const response = await page.request.post("/api/library/read", { headers: { Origin: baseURL! }, data: { app: "map", id } });
  const stored = await response.json();
  const show = JSON.parse(Buffer.from(stored.data_base64, "base64").toString());
  const [square, circle, image] = show.scenes[0].surfaces;
  expect(show.scenes[0].surfaces).toHaveLength(3);
  expect(square.corners[1][0] - square.corners[0][0]).toBeCloseTo(square.corners[3][1] - square.corners[0][1], 1);
  const xs = circle.masks[0].map(([x]: [number, number]) => x);
  const ys = circle.masks[0].map(([, y]: [number, number]) => y);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 1);
  expect(image.name).toBe("transparent.png");
  expect(image.clips).toHaveLength(1);
});

test("picking a primitive arms its drawing tool rather than dropping a shape", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await openSheet(page);
  await sheet(page).getByRole("button", { name: "Circle", exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  // You place a circle by drawing it, so the sheet selects the tool and gets
  // out of the way — the canvas is now in drawing mode.
  await expect(page.locator(".map-canvas-host.is-drawing")).toBeVisible();
  await expect(page.locator(".map-surface-cell")).toHaveCount(0);
});

test("Import backdrop adds an alignment-only reference from the shape sheet", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const picker = page.waitForEvent("filechooser");
  await openSheet(page);
  await sheet(page).getByRole("button", { name: /Import backdrop/ }).click();
  await (await picker).setFiles({ name: "room.png", mimeType: "image/png", buffer: solidPng(320, 180, [30, 90, 130]) });
  await expect(page.getByRole("img", { name: "Backdrop", exact: true })).toBeVisible();
  await expect(page.locator(".map-surface-cell")).toHaveCount(1);
  await openPanel(page, "Layers");
  await expect(layers(page).getByRole("treeitem").filter({ hasText: "Backdrop — room.png" })).toBeVisible();
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(0);
  await expect(output.locator("img")).toHaveCount(0);
});
