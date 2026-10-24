import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, command, openOutput, saveShow, signIn } from "./helpers";

const layers = (page: Page) => page.getByRole("tree", { name: "Layers", exact: true });
// Level 1 is the scene; a layer of that scene is level 2.
const roots = (page: Page) => layers(page).locator('[role=treeitem][aria-level="2"]');
const selected = (page: Page) => layers(page).locator('[aria-selected="true"]');
async function points(page: Page) {
  return page.locator(".map-outline.is-selected").evaluate((el) => el.getAttribute("points")!.split(" ").map((point) => point.split(",").map(Number)));
}
async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}

test("canvas selects, moves whole features, nudges, cancels, deletes and undoes without losing corner warping", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Shader"); await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const box = (await page.locator(".map-outline").boundingBox())!;
  const scale = (await page.locator(".map-raster").boundingBox())!.width / 1920;
  const original = await points(page);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, center.x, center.y, 35, 20);
  const moved = await points(page);
  for (let i = 0; i < 4; i++) { expect(moved[i][0] - original[i][0]).toBe(Math.round(35 / scale)); expect(moved[i][1] - original[i][1]).toBe(Math.round(20 / scale)); }
  await drag(page, center.x + 35, center.y + 20, 10, 0);
  await page.keyboard.press("Meta+z"); expect(await points(page)).toEqual(moved);
  await page.keyboard.press("Meta+z"); expect(await points(page)).toEqual(original);
  await page.keyboard.press("Meta+Shift+z"); expect(await points(page)).toEqual(moved);
  await page.keyboard.press("Shift+ArrowRight");
  const nudged = await points(page); expect(nudged[0][0]).toBe(moved[0][0] + 10);
  await page.mouse.move(center.x + 35, center.y + 20); await page.mouse.down(); await page.mouse.move(center.x + 60, center.y + 40);
  await page.keyboard.press("Escape"); await page.mouse.up(); expect(await points(page)).toEqual(nudged);
  await clickRibbon(page, "Node");
  await expect(page.locator(".map-resize-handle")).toHaveCount(0);
  await expect(page.locator(".map-handle")).toHaveCount(4);
  const handle = (await page.locator(".map-handle").first().boundingBox())!;
  await drag(page, handle.x + handle.width / 2, handle.y + handle.height / 2, 12, 8);
  const warped = await points(page); expect(warped[0]).not.toEqual(nudged[0]); expect(warped.slice(1)).toEqual(nudged.slice(1));
  await page.keyboard.press("Meta+z"); expect(await points(page)).toEqual(nudged);
  await clickRibbon(page, "Select");
  await expect(page.locator(".map-resize-handle")).toHaveCount(8);
  await expect(page.locator(".map-handle")).toHaveCount(0);
  // Space-drag over an asset pans the view without editing it.
  await page.keyboard.down("Space"); await drag(page, center.x + 35, center.y + 20, 20, 10); await page.keyboard.up("Space");
  expect(await points(page)).toEqual(nudged);
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  const newBox = (await page.locator(".map-outline").boundingBox())!;
  await page.mouse.click(newBox.x + newBox.width / 2, newBox.y + newBox.height / 2);
  await page.keyboard.press("Backspace"); await expect(roots(page)).toHaveCount(0);
  await expect(output.locator(".map-surface")).toHaveCount(0);
  await page.keyboard.press("Meta+z"); await expect(roots(page)).toHaveCount(1);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await roots(page).click();
  await page.screenshot({ path: info.outputPath("canvas-and-standard-trees.png") });
  await saveShow(page, "Manipulation regression"); await page.reload(); await expect(roots(page)).toHaveCount(1);
  await output.close();
});

test("layer tree commands, row states, masks, overlap picking and text focus agree", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Shader"); await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  await clickRibbon(page, "Ellipse");
  const raster = (await page.locator(".map-raster").boundingBox())!;
  const x = raster.x + raster.width * 0.35, y = raster.y + raster.height * 0.35;
  await drag(page, x, y, raster.width * 0.2, raster.height * 0.2);
  await expect(roots(page)).toHaveCount(2);
  const profile = await selected(page).textContent();
  const maskBefore = await page.locator(".map-mask-outline").getAttribute("points");
  await drag(page, x + raster.width * 0.1, y + raster.height * 0.1, 10, 5);
  expect(await page.locator(".map-mask-outline").getAttribute("points")).not.toBe(maskBefore);
  // The visible top feature is selected; Alt-click reaches the one behind it.
  const click = { x: x + raster.width * 0.1 + 10, y: y + raster.height * 0.1 + 5 };
  await page.mouse.click(click.x, click.y); await expect(selected(page)).toContainText(profile!);
  await page.keyboard.down("Alt"); await page.mouse.click(click.x, click.y); await page.keyboard.up("Alt");
  await expect(selected(page)).toContainText("Surface 1");
  const shader = roots(page).filter({ has: page.getByText("Surface 1", { exact: true }) });
  await shader.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide", exact: true }).click();
  await expect(shader.getByRole("button", { name: "Show Surface 1" })).toBeVisible();
  await shader.getByRole("button", { name: "Show Surface 1" }).click();
  await shader.click({ button: "right" }); await page.getByRole("menuitem", { name: "Lock", exact: true }).click();
  await expect(await command(page, "Layer controls", "Delete layer")).toBeDisabled();
  await page.keyboard.press("Escape");
  await shader.press("Delete"); await expect(roots(page)).toHaveCount(2);
  await shader.getByRole("button", { name: "Unlock Surface 1" }).click();
  await shader.click(); await (await command(page, "Layer controls", "Move layer forward")).click();
  await expect(roots(page).first()).toContainText("Surface 1");
  await (await command(page, "Layer controls", "Duplicate layer")).click();
  await expect(roots(page)).toHaveCount(3);
  await selected(page).click(); await selected(page).press("F2");
  const rename = page.getByRole("textbox", { name: "Rename Surface 1 copy" });
  await rename.fill("Moved shader!"); await rename.press("Backspace"); await rename.press("Enter");
  await expect(roots(page)).toHaveCount(3);
  const renamed = roots(page).filter({ has: page.locator(".aui-tree-label").filter({ hasText: /^Moved shader$/ }) });
  await expect(renamed).toBeVisible();
  await renamed.click(); await renamed.press("Shift+F10"); await page.getByRole("menuitem", { name: /^Delete/ }).click();
  await expect(roots(page)).toHaveCount(2);
  await page.getByRole("button", { name: "New scene", exact: true }).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  const scenes = page.getByRole("tree", { name: "Layers", exact: true });
  // A scene row with children carries a disclosure control, which joins its
  // accessible name, so the row no longer matches its label exactly.
  await scenes.getByRole("treeitem", { name: /Scene 1/ }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate scene", exact: true }).click();
  await expect(scenes.locator('[role=treeitem][aria-level="1"]')).toHaveCount(3);
  // Two scenes now, each with the same two layers: duplicating a scene copies them.
  await expect(roots(page)).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("tree-footer-state-menu.png") });
});
