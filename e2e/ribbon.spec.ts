import { expect, test } from "@playwright/test";
import { openOutput, saveShow, signIn, switchWorkspace, openPanel, clickRibbon } from "./helpers";

const alphaPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP4z8DAgA/jlURX8B8ND4QC8nwBAGHnT7EZapMkAAAAAElFTkSuQmCC", "base64");

test("Map icon pack and workbench palette stay consistent in light and dark", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.addInitScript(() => localStorage.setItem("aether-appearance", "light"));
  await page.goto("/map/index.html?new=show");
  const ribbon = page.getByRole("region", { name: "Map tools" });
  const command = (name: string) => ribbon.getByRole("button", { name, exact: true });
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "light");
  await expect(page.getByRole("tree", { name: "Layers" }).locator('[role="treeitem"][aria-level="1"] svg[data-icon="scene"]')).toHaveCount(1);
  for (const name of ["Import backdrop", "Rectangle", "Ellipse", "Cube"]) {
    await expect(command(name).locator("svg.aui-tool-icon")).toHaveCount(1);
  }
  await page.screenshot({ path: info.outputPath("map-workbench-light.png") });
  await page.locator(".map-surfaces-add").click();
  const shapes = page.getByRole("dialog", { name: "Add Shape" });
  for (const name of ["Square", "Circle", "Cube", "Box", "Transparent PNG", "Import backdrop"]) {
    await expect(shapes.getByRole("button", { name: new RegExp(`^${name}`) }).locator("svg.aui-tool-icon")).toHaveCount(1);
  }
  await page.screenshot({ path: info.outputPath("map-icons-light.png") });
  await page.keyboard.press("Escape");
  await expect(shapes).toBeHidden();
  await page.locator(".aui-application-account").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  await page.screenshot({ path: info.outputPath("map-workbench-dark.png") });
  await page.locator(".map-surfaces-add").click();
  await page.screenshot({ path: info.outputPath("map-icons-dark.png") });
});

test("Mapping and Visualization separate geometry from content while sharing selection, document and live output", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.addInitScript(() => {
    localStorage.setItem("aether-map.mapping.ribbon-tab", "media");
    localStorage.setItem("aether-map.sequence.ribbon-tab", "features");
  });
  await page.goto("/map/index.html?new=show");
  const tools = page.getByRole("region", { name: "Map tools" });
  const command = (name: string) => tools.getByRole("button", { name, exact: true });
  await expect(page.getByRole("navigation",{name:"Workspaces"})).toBeVisible();
  await expect(command("Shader")).toHaveCount(0);
  expect(await page.getByRole("toolbar", { name: "Map workspace dock tabs" }).getByRole("button").evaluateAll(nodes => nodes.map(n => n.getAttribute("aria-label")))).toEqual(["Surfaces", "Timeline"]);
  await command("Cube").click();
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: /^Cube right(?: Hide Cube right)?$/ }).click();
  await expect(page.locator('.map-surface[data-preview="mapping"]')).toHaveCount(3);
  await switchWorkspace(page, "Visualization");
  await expect(tools).toHaveCount(0);
  await expect(command("Rectangle")).toHaveCount(0);
  await expect(command("Shader")).toHaveCount(0);
  await expect(command("AI Generation")).toHaveCount(0);
  // Create in the pool, then place it on the timeline.
  await clickRibbon(page, "Text");
  await page.getByRole("region", { name: "Asset properties" }).getByRole("tab", { name: "Adjust", exact: true }).click();
  await page.getByLabel("Text content", { exact: true }).fill("Workspace parity");
  await expect(page.locator('.map-raster.is-active .map-text')).toContainText("Workspace parity");
  const output = await openOutput(page);
  await expect(output.locator('.map-text')).toContainText("Workspace parity");
  await openPanel(page, "Layers");
  await page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: /Cube right/ }).first().click();
  await switchWorkspace(page, "Mapping");
  await expect(page.locator('.map-surface[data-preview="mapping"]')).toHaveCount(3);
  await expect(page.locator('.map-surface .map-text, .map-surface img, .map-surface video, .map-surface canvas')).toHaveCount(0);
  await expect(page.getByLabel("Surface content", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "Layers" }).getByRole("treeitem", { name: /^Cube right(?: Hide Cube right)?$/ })).toHaveAttribute("aria-selected", "true");
  await expect(output.locator('.map-text')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("mapping-checkerboard.png") });
  await switchWorkspace(page, "Visualization");
  await expect(page.locator('.map-raster.is-active .map-text')).toContainText("Workspace parity");
  await page.screenshot({ path: info.outputPath("visualization-content.png") });
  await expect(page.locator(".map-save-state")).toHaveText("Saved");
  await page.reload();
  await expect(page.locator('.map-surface[data-preview="mapping"]')).toHaveCount(3);
  await switchWorkspace(page, "Visualization");
  await expect(page.locator('.map-raster.is-active .map-text')).toContainText("Workspace parity");
});

test("Mapping toolbar shapes create constrained Square/Circle", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const tools = page.getByRole("region", { name: "Map tools" });
  const command = (name: string) => tools.getByRole("button", { name, exact: true });
  await command("Cube").click();
  await expect(page.locator(".map-surface-cell")).toHaveCount(3);
  await clickRibbon(page,"Box");
  await expect(page.locator(".map-surface-cell")).toHaveCount(8);

  const draw = async (name: string, offset: number, shift = false) => {
    await clickRibbon(page,name);
    const raster = (await page.locator(".map-raster.is-active").boundingBox())!;
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(raster.x + raster.width * offset, raster.y + raster.height * offset);
    await page.mouse.down();
    await page.mouse.move(raster.x + raster.width * (offset + .13), raster.y + raster.height * (offset + .07), { steps: 5 });
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  };
  await draw("Rectangle", .18, true);
  await draw("Ellipse", .67, true);
  await draw("Square", .30);
  await draw("Circle", .52);
  await command("Select").click();
  await command("Ellipse variants").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio",{name:"Ellipse",exact:true})).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio",{name:"Circle",exact:true})).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(command("Ellipse variants")).toBeFocused();
  await switchWorkspace(page,"Visualization");
  await switchWorkspace(page,"Mapping");
  await expect(page.locator(".map-surface-cell")).toHaveCount(12);
  await expect(page.locator(".map-surface-cell").nth(8)).toHaveAccessibleName("Square 9");
  await expect(page.locator(".map-surface-cell").nth(9)).toHaveAccessibleName("Circle 10");
  await expect(page.locator(".map-surface-cell").nth(10)).toHaveAccessibleName("Square 11");
  await expect(page.locator(".map-surface-cell").nth(11)).toHaveAccessibleName("Circle 12");

  await expect(page.locator(".map-save-state")).toHaveText("Saved");
  const id = new URL(page.url()).searchParams.get("document")!;
  const response = await page.request.post("/api/library/read", { headers: { Origin: baseURL! }, data: { app: "map", id } });
  const stored = await response.json();
  const show = JSON.parse(Buffer.from(stored.data_base64, "base64").toString());
  const [shiftSquare, shiftCircle, square, circle] = show.scenes[0].surfaces.slice(-4);
  const span = (points: [number, number][]) => {
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  for (const surface of [shiftSquare, square]) {
    const [width, height] = span(surface.corners);
    expect(width).toBeCloseTo(height, 1);
  }
  for (const surface of [shiftCircle, circle]) {
    const [width, height] = span(surface.masks[0]);
    expect(width).toBeCloseTo(height, 1);
  }
});

test("Media and Output tabs expose import, device and export tools", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const tools = page.getByRole("region", { name: "Map tools" });
  const command = (name: string) => tools.getByRole("button", { name, exact: true });

  await expect(command("Transparent PNG")).toBeVisible();
  await expect(command("Transparent PNG")).toBeInViewport();
  const picker = page.waitForEvent("filechooser");
  await command("Transparent PNG").click();
  const chooser = await picker;
  expect(await (await chooser.element()).evaluate(input => input.getAttribute("accept"))).toContain("image/png");
  await chooser.setFiles({ name: "logo.png", mimeType: "image/png", buffer: alphaPng });
  await expect(page.locator(".map-surface-cell")).toHaveCount(1);

  await switchWorkspace(page, "Visualization");
  await expect(page.getByRole("button",{name:"Input preview",exact:true})).toBeVisible();
  await expect(page.getByRole("region", { name: "Media Pool", exact: true }).getByRole("button", { name: "Import", exact: true })).toBeVisible();
  await switchWorkspace(page,"Show");
  const workspace=page.getByRole("region",{name:"Show workspace",exact:true});
  await workspace.getByRole("button",{name:"Add output",exact:true}).click();
  await expect(page.getByRole("tree",{name:"Outputs"}).getByRole("treeitem")).toHaveCount(2);
  await workspace.getByRole("tab",{name:"Players",exact:true}).click();
  await expect(workspace.getByRole("button",{name:"Set up a new one"})).toBeVisible();
  // SVG exports current document geometry, including an unsaved show.
  await page.getByRole("button", { name: "Document controls" }).first().click();
  await expect(page.getByRole("menuitem", { name: /^Download mapping as SVG/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await saveShow(page, "Toolbar coverage");
  await page.getByRole("button", { name: "Document controls" }).first().click();
  await expect(page.getByRole("menuitem", { name: /^Download mapping as SVG/ })).toBeEnabled();
  await page.keyboard.press("Escape");
});
