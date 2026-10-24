import { expect, test } from "@playwright/test";
import { documentCommand, signIn } from "./helpers";

test.beforeEach(async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host")).toBeVisible();
});

test("cube footer deletion preserves both scenes and unrelated surfaces; Undo restores the whole group", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  const toolbar = page.getByRole("region", { name: "Map tools" });
  await toolbar.getByRole("button", { name: "Cube", exact: true }).click();
  await page.getByRole("button", { name: "New scene", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await toolbar.getByRole("button", { name: "Cube", exact: true }).click();
  const cubes = tree.getByRole("treeitem", { name: /^Collapse Cube Cube 3 layers(?: Hide Cube)?$/ });
  await expect(cubes).toHaveCount(2);
  await cubes.first().click();
  await page.getByRole("button", { name: "More Layer controls" }).click();
  await page.getByRole("menuitem", { name: /^Delete group/ }).click();
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')).toHaveCount(2);
  await expect(cubes).toHaveCount(1);
  await expect(tree.getByRole("treeitem", { name: /^Cube (right|left|top)(?: Hide Cube (right|left|top))?$/ })).toHaveCount(3);
  await documentCommand(page, "Undo");
  await expect(cubes).toHaveCount(2);
  await expect(tree.getByRole("treeitem", { name: /^Cube (right|left|top)(?: Hide Cube (right|left|top))?$/ })).toHaveCount(6);
  // A face selection removes only that face.
  await tree.getByRole("treeitem", { name: /^Cube right(?: Hide Cube right)?$/ }).first().click();
  await toolbar.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(tree.getByRole("treeitem", { name: /^Cube (right|left|top)(?: Hide Cube (right|left|top))?$/ })).toHaveCount(5);
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')).toHaveCount(2);
});

test("box deletion via keyboard and context menu stays within the selected component", async ({ page }) => {
  const toolbar = page.getByRole("region", { name: "Map tools" });
  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  await toolbar.getByRole("button", { name: "Cube variants" }).click();
  await page.getByRole("menuitemradio", { name: "Box", exact: true }).click();
  await expect(page.locator(".map-outline")).toHaveCount(5);
  await page.locator(".map-canvas-host").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".map-outline")).toHaveCount(0);
  await expect(tree.getByRole("treeitem")).toHaveCount(1);
  await documentCommand(page, "Undo");
  await expect(page.locator(".map-outline")).toHaveCount(5);
  await tree.getByRole("treeitem", { name: /^Collapse Box Box 5 layers(?: Hide Box)?$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Delete group and contents/ }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(1);
});

test("Mapping toolbar shape menus stay reachable across layouts",async({page})=>{
  const tools=page.getByRole('region',{name:'Map tools'});
  for(const mode of ['Docked','Canvas','Floating']) {
    if(mode==='Canvas') await page.locator('.aui-shell-edge--top').hover();
    await tools.getByRole('button',{name:'Ellipse variants'}).click();
    const menu=page.getByRole('menu',{name:'Ellipse variants'});
    await expect(menu).toBeInViewport();
    expect(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+20));})).toBe(true);
    await page.getByRole('menuitemradio',{name:'Circle',exact:true}).click();
    await expect(page.locator('.map-canvas-host')).toHaveClass(/is-drawing/);
    await page.getByRole('button',{name:`Studio mode: ${mode}`,exact:true}).click();
  }
});

test("both library toolbar designs dock full width and open their menus outside the tool row", async ({ page, baseURL }, info) => {
  // This test runs on host.py's throwaway admin account and temporary data store.
  const enable = await page.request.post("/api/admin/apps", { headers: { Origin: baseURL! }, data: { id: "ui", enabled: true } });
  expect(enable.ok()).toBe(true);
  await page.goto("/ui/index.html#tab=widgets");
  const section = page.locator('[data-gallery-section="Top tool bars"]');
  await section.scrollIntoViewIfNeeded();
  for (const [selector, name] of [[".aui-workspace-ribbon", "aether"], [".aui-kit-tool-sidebar", "kit"]]) {
    const specimen = section.locator(".gallery-variant").filter({ has: page.locator(selector) });
    await specimen.getByRole("checkbox", { name: "docked", exact: true }).check();
    const ribbon = specimen.locator(selector);
    await ribbon.scrollIntoViewIfNeeded();
    await expect(ribbon).toHaveAttribute("data-docked");
    await expect(ribbon).toHaveCSS("border-radius", "0px");
    expect(await ribbon.evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.getBoundingClientRect().width))).toBeLessThan(2);
    await ribbon.getByRole("button", { name: "Create tools", exact: true }).click();
    const menu = page.getByRole(name === "aether" ? "menu" : "dialog", { name: name === "aether" ? "Create tools" : "Create", exact: true });
    await expect(menu).toBeVisible();
    const bar = (await ribbon.boundingBox())!, popup = (await menu.boundingBox())!;
    expect(popup.y >= bar.y + bar.height || popup.y + popup.height <= bar.y).toBe(true);
    expect(await menu.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + 20));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath(`library-${name}-docked-menu.png`) });
    await page.keyboard.press("Escape");
    await specimen.getByRole("checkbox", { name: "docked", exact: true }).uncheck();
    await expect(ribbon).not.toHaveAttribute("data-docked");
  }
});
