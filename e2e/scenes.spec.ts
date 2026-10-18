import { expect, test } from "@playwright/test";
import { bindOutputScene, command as collectionCommand, openOutput, openPanel, ribbon, saveShow, signIn, clickRibbon, documentCommand } from "./helpers";

test("dragging a shape onto another artboard reparents its tree row and rendering", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Rectangle");
  const initialBoard = (await page.locator(".map-artboard.is-active").boundingBox())!;
  await page.mouse.move(initialBoard.x + initialBoard.width * .3, initialBoard.y + initialBoard.height * .3);
  await page.mouse.down();
  await page.mouse.move(initialBoard.x + initialBoard.width * .45, initialBoard.y + initialBoard.height * .5, { steps: 5 });
  await page.mouse.up();

  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const labels = tree.locator(".aui-tree-label");
  const layer = tree.locator('[role="treeitem"][aria-level="2"]').first();
  await expect(labels).toHaveText(["Scene 1", "Surface 1"]);
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await (await collectionCommand(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  await tree.locator('[role="treeitem"][aria-level="1"]').first().click();
  await layer.click();
  await expect(labels).toHaveText(["Scene 1", "Surface 1", "Scene 2"]);

  // Inactive artboards render before the active one in DOM order, so target
  // the scene state rather than relying on an index that changes after drop.
  const shape = (await page.locator(".map-artboard.is-active .map-outline.is-selected").boundingBox())!;
  const destination = (await page.locator(".map-artboard:not(.is-active)").boundingBox())!;
  await page.mouse.move(shape.x + shape.width / 2, shape.y + shape.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator(".map-artboard:not(.is-active) .map-surface")).toHaveCount(0);
  await expect(page.locator(".map-artboard.is-active .map-surface")).toHaveCount(1);
  await expect(page.locator(".map-artboard.is-active .map-outline.is-selected")).toHaveCount(1);
  await expect(labels).toHaveText(["Scene 1", "Scene 2", "Surface 1"]);
  await expect(layer).toHaveAttribute("aria-selected", "true");
  await expect(output.locator(".map-surface")).toHaveCount(0);

  // Reparenting and coordinate conversion are the same pointer gesture.
  await documentCommand(page, "Undo");
  await expect(labels).toHaveText(["Scene 1", "Surface 1", "Scene 2"]);
  await expect(page.locator(".map-artboard.is-active .map-surface")).toHaveCount(1);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await documentCommand(page, "Redo");
  await expect(labels).toHaveText(["Scene 1", "Scene 2", "Surface 1"]);
  await expect(page.locator(".map-artboard.is-active .map-surface")).toHaveCount(1);
  await expect(output.locator(".map-surface")).toHaveCount(0);
  await bindOutputScene(page, "Scene 2");
  await expect(output.locator(".map-surface")).toHaveCount(1);
});

test("a surface can live outside every artboard and later be assigned to a scene", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Rectangle");
  const first = (await page.locator(".map-artboard.is-active").boundingBox())!;
  await page.mouse.move(first.x + first.width * .3, first.y + first.height * .3);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width * .42, first.y + first.height * .44, { steps: 5 });
  await page.mouse.up();
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const layer = tree.getByRole("treeitem", { name: /Surface 1/ });
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await (await collectionCommand(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true })
    .getByRole("button", { name: "Create", exact: true }).click();
  await tree.getByRole("treeitem", { name: /Scene 1/ }).click();
  await layer.click();
  const board1 = (await page.locator(".map-artboard.is-active").boundingBox())!;
  const board2 = (await page.locator(".map-artboard:not(.is-active)").boundingBox())!;
  const selected = (await page.locator(".map-artboard.is-active .map-outline.is-selected").boundingBox())!;
  const gutterX = (board1.x + board1.width + board2.x) / 2;
  await page.mouse.move(selected.x + selected.width / 2, selected.y + selected.height / 2);
  await page.mouse.down();
  await page.mouse.move(gutterX, board1.y + board1.height * .45, { steps: 10 });
  await page.mouse.up();

  await expect(layer).toHaveAttribute("aria-level", "1");
  await expect(layer).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".map-loose-overlay .map-outline.is-selected")).toHaveCount(1);
  await expect(page.locator(".map-artboard .map-surface")).toHaveCount(0);
  await expect(output.locator(".map-surface")).toHaveCount(0);

  const loose = (await page.locator(".map-loose-overlay .map-outline.is-selected").boundingBox())!;
  await page.mouse.move(loose.x + loose.width / 2, loose.y + loose.height / 2);
  await page.mouse.down();
  await page.mouse.move(board2.x + board2.width * .45, board2.y + board2.height * .45, { steps: 10 });
  await page.mouse.up();

  await expect(layer).toHaveAttribute("aria-level", "2");
  await expect(layer).toHaveAttribute("aria-selected", "true");
  await expect(tree.getByRole("treeitem", { name: /Scene 2/ })).toHaveClass(/map-tree-active-scene/);
  await expect(page.locator(".map-artboard.is-active .map-outline.is-selected")).toHaveCount(1);
  await expect(page.locator(".map-loose-overlay .map-outline")).toHaveCount(0);
});

test("a tree-selected Box transfers as one selectable object between artboards", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const tools = page.getByRole("region", { name: "Map tools" });
  await tools.getByRole("button", { name: "Cube variants", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Box", exact: true }).click();
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const boxRow = tree.getByRole("treeitem", { name: /^Collapse Box/ }).first();
  await expect(boxRow).toBeVisible();

  await (await collectionCommand(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  // Select the object directly from another scene's tree branch. This must cut
  // to its owning scene and leave the object selected and movable.
  await boxRow.click();
  await expect(tree.locator('[role="treeitem"][aria-level="1"]').first()).toHaveClass(/map-tree-active-scene/);
  await expect(boxRow).toHaveAttribute("aria-selected", "true");
  const group = (await page.locator(".map-group-bounds").boundingBox())!;
  const destination = (await page.locator(".map-artboard:not(.is-active)").boundingBox())!;
  await page.mouse.move(group.x + group.width / 2, group.y + group.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 10 });
  await page.mouse.up();

  const roots = tree.locator('[role="treeitem"][aria-level="1"]');
  await expect(roots.nth(1)).toHaveClass(/map-tree-active-scene/);
  await expect(boxRow).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".map-group-bounds")).toHaveCount(1);
  await expect(page.locator(".map-artboard.is-active .map-outline.is-selected")).toHaveCount(5);
  // The group row follows Scene 2 in the flattened tree rather than remaining
  // between Scene 1 and Scene 2.
  const labels = tree.locator(".aui-tree-label");
  await expect(labels.nth(0)).toHaveText("Scene 1");
  await expect(labels.nth(1)).toHaveText("Scene 2");
  await expect(labels.nth(2)).toHaveText("Box");

  // A face can still be selected from its moved tree branch and dragged on the
  // destination artboard without another scene-selection step.
  const face = tree.locator('[role="treeitem"][aria-level="3"]').first();
  await face.click();
  await expect(face).toHaveAttribute("aria-selected", "true");
  const before = await page.locator(".map-outline.is-selected").getAttribute("points");
  const faceBounds = (await page.locator(".map-outline.is-selected").boundingBox())!;
  await page.mouse.move(faceBounds.x + faceBounds.width / 2, faceBounds.y + faceBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(faceBounds.x + faceBounds.width / 2 + 20, faceBounds.y + faceBounds.height / 2 + 12, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".map-outline.is-selected")).not.toHaveAttribute("points", before!);
});

test("a layer visually stranded over another artboard remains selectable and can complete its transfer", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Rectangle");
  const board = (await page.locator(".map-artboard.is-active").boundingBox())!;
  await page.mouse.move(board.x + board.width * .2, board.y + board.height * .25);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * .35, board.y + board.height * .45, { steps: 5 });
  await page.mouse.up();
  await openPanel(page, "Transform");
  const transform = page.getByRole("region", { name: "Layer transform" }).last();
  const x = transform.getByRole("textbox", { name: "Layer X", exact: true });
  await x.fill("2100");
  await x.press("Enter");

  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const layer = tree.locator('[role="treeitem"][aria-level="2"]').first();
  await (await collectionCommand(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  await layer.click();
  await expect(layer).toHaveAttribute("aria-selected", "true");
  await expect(tree.locator('[role="treeitem"][aria-level="1"]').first()).toHaveClass(/map-tree-active-scene/);

  // The layer belongs to Scene 1 but is visibly sitting over Scene 2. Clicking
  // its body must hit the selected layer before the artboard below it.
  const escaped = (await page.locator(".map-transform-box").boundingBox())!;
  await page.mouse.move(escaped.x + escaped.width / 2, escaped.y + escaped.height / 2);
  await page.mouse.down();
  await page.mouse.move(escaped.x + escaped.width / 2 + 20, escaped.y + escaped.height / 2 + 12, { steps: 5 });
  await page.mouse.up();

  await expect(tree.locator('[role="treeitem"][aria-level="1"]').nth(1)).toHaveClass(/map-tree-active-scene/);
  await expect(layer).toHaveAttribute("aria-selected", "true");
  await expect(tree.locator(".aui-tree-label")).toHaveText(["Scene 1", "Scene 2", "Surface 1"]);
  await expect(page.locator(".map-artboard.is-active .map-outline.is-selected")).toHaveCount(1);
});

test("a polygon moved to another scene stops drawing on its original artboard and output", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "Polygon");
  const board = (await page.locator(".map-artboard.is-active").boundingBox())!;
  await page.mouse.move(board.x + board.width * .4, board.y + board.height * .4);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * .5, board.y + board.height * .4, { steps: 5 });
  await page.mouse.up();
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const polygon = tree.getByRole("treeitem", { name: /Polygon 1/ });
  await expect(polygon).toBeVisible();
  const sides = page.getByRole("textbox", { name: "Polygon sides" });
  await expect(sides).toHaveValue("6");
  await sides.fill("5");
  await sides.press("Enter");
  await expect(page.locator(".map-artboard.is-active .map-mask-outline")).toHaveAttribute("points", /^.+ .+ .+ .+ .+$/);
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await (await collectionCommand(page, "Layer controls", "New scene")).click();
  await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click();
  const scene2 = tree.getByRole("treeitem", { name: /Scene 2/ });
  await polygon.dragTo(scene2);
  await expect(polygon).toBeVisible();
  await expect(page.locator(".map-artboard").first().locator(".map-surface")).toHaveCount(0);
  await expect(output.locator(".map-surface")).toHaveCount(0);
  await bindOutputScene(page, "Scene 2");
  await expect(output.locator(".map-surface")).toHaveCount(1);
});

test("scene tree has one toolbar, reorders without cutting output, and saves scene properties and order", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  // Scenes are the roots of the one content tree; their layers are rows too, so
  // every assertion about scene order is scoped to the top level.
  const rows = tree.locator('[role="treeitem"][aria-level="1"]');
  // Scenes and layers are one tree. The footer keeps "New folder" and
  // "New scene"; every other command is in its "More Layer controls" menu.
  const command = (name: string) => collectionCommand(page, "Layer controls", name);
  const properties = page.getByRole("region", { name: "Selection properties" });
  await expect(rows).toHaveText(["Scene 1"]);
  await expect(rows.getByRole("button", { name: "Hide Scene 1 on the canvas" })).toBeVisible();
  for (const name of ["Delete scene", "Move scene up", "Move scene down"]) {
    await expect(await command(name)).toBeDisabled();
  }
  // Asserting on a menu command leaves the menu open; it owns focus until closed.
  await page.keyboard.press("Escape");
  for (let n = 0; n < 2; n++) { await (await command("New scene")).click(); await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click(); }
  await expect(rows).toHaveText(["Scene 1", "Scene 2", "Scene 3"]);
  await (await command("Scene properties")).click();
  await properties.getByRole("textbox", { name: "Scene name" }).fill("Finale");
  await properties.getByRole("textbox", { name: "Scene width" }).fill("-1");
  await properties.getByRole("textbox", { name: "Scene width" }).press("Enter");
  await expect(properties.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  await properties.getByRole("textbox", { name: "Scene width" }).fill("1440");
  await properties.getByRole("textbox", { name: "Scene width" }).press("Enter");
  await properties.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(rows).toHaveText(["Scene 1", "Scene 2", "Finale"]);

  // Drafts do not change the show until applied.
  await rows.last().dblclick();
  await properties.getByRole("textbox", { name: "Scene name" }).fill("Discard this edit");
  await rows.first().click(); await rows.last().click();
  await expect(rows.last()).toHaveText("Finale");

  await clickRibbon(page, "New Surface");
  const output = await openOutput(page);
  // The surface went on "Finale", the scene being edited; the output is still
  // linked to Scene 1, and an output shows only what it is linked to.
  await expect(output.locator(".map-surface")).toHaveCount(0);
  await bindOutputScene(page, "Finale");
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await clickRibbon(page, "Play");
  // One tree, one toolbar: its commands act on whatever is selected, so a scene
  // command needs a scene selected. Adding the surface above selected a layer.
  await tree.getByRole("treeitem", { name: /Finale/ }).click();
  await (await command("Move scene up")).click();
  await expect(rows).toHaveText(["Scene 1", "Finale", "Scene 2"]);
  await expect(tree.getByRole("treeitem", { name: /Finale/ })).toHaveAttribute("aria-selected", "true");
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await expect(ribbon(page, "Pause")).toBeVisible();
  await documentCommand(page, "Undo");
  await expect(rows).toHaveText(["Scene 1", "Scene 2", "Finale"]);
  await documentCommand(page, "Redo");
  await expect(rows).toHaveText(["Scene 1", "Finale", "Scene 2"]);
  await (await command("Move scene down")).click();
  await expect(rows).toHaveText(["Scene 1", "Scene 2", "Finale"]);
  await clickRibbon(page, "Pause");

  // Exercise the actual HTML drag/drop path, placing before the first row.
  const target = (await rows.first().boundingBox())!;
  await tree.getByRole("treeitem", { name: /Finale/ }).dragTo(rows.first(), {
    targetPosition: { x: target.width / 2, y: 2 },
  });
  await expect(rows).toHaveText(["Finale", "Scene 1", "Scene 2"]);
  await expect(await command("Move scene up")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await (await command("Duplicate scene")).click();
  await expect(rows.last()).toHaveText("Finale copy");
  await (await command("Delete scene")).click();
  await expect(rows).toHaveText(["Finale", "Scene 1", "Scene 2"]);
  await expect(rows.last()).toHaveAttribute("aria-selected", "true");
  // Still on Finale, which is the point of the test's name: duplicating,
  // deleting and selecting scenes are editing actions, and none of them cuts
  // what an output is projecting. Only relinking the output does that.
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await rows.first().click();
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await saveShow(page, "Scene tree workflow");
  await page.reload();
  await expect(rows).toHaveText(["Finale", "Scene 1", "Scene 2"]);
  await tree.getByRole("treeitem", { name: /Finale/ }).focus();
  await page.keyboard.press("F2");
  await expect(page.getByRole("textbox", { name: "Rename Finale" })).toHaveValue("Finale");
  await page.keyboard.press("Escape");
  await rows.first().dblclick();
  await expect(properties.getByRole("textbox", { name: "Scene width" })).toHaveValue("1440");
  await rows.first().click(); await rows.last().click();
  await expect(tree.getByRole("treeitem", { name: /Finale/ })).toBeFocused();
  await page.screenshot({ path: info.outputPath("scene-tree.png") });
});

test("scene controls stay at the bottom while a long scene list scrolls in small windows", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/map/index.html?new=show");
  const controls = page.getByRole("group", { name: "Layer controls" });
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  for (let n = 0; n < 39; n++) { await controls.getByRole("button", { name: "New scene", exact: true }).click(); await page.getByRole("dialog", { name: "New scene", exact: true }).getByRole("button", { name: "Create", exact: true }).click(); }
  await expect(tree.getByRole("treeitem")).toHaveCount(40);
  for (const viewport of [{ width: 1024, height: 640 }, { width: 800, height: 500 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => tree.locator("..").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const before = (await controls.boundingBox())!;
    await tree.locator("..").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const after = (await controls.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.y + after.height).toBeLessThan(viewport.height);
    for (const button of await controls.getByRole("button").all()) await expect(button).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
    expect(await tree.locator("..").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`scene-tree-${viewport.width}.png`) });
  }
  await page.screenshot({ path: info.outputPath("scrolling-scene-tree.png") });
});
