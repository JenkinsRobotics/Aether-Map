import { expect, test, type Page } from "@playwright/test";
import { createIOProject, openAppSettings, signIn } from "./helpers";

async function io(page: Page, baseURL: string) {
  await signIn(page, baseURL);
  expect((await page.request.post("/api/admin/apps", { headers: { Origin: baseURL }, data: { id: "io", enabled: true } })).ok()).toBe(true);
  await page.goto("/io/");
  await createIOProject(page);
}
async function settings(page: Page) {
  await openAppSettings(page);
  const dialog = page.getByRole("dialog", { name: "Aether IO settings" });
  return dialog;
}
async function chrome(page: Page) {
  const dialog = await settings(page);
  await dialog.getByRole("button", { name: "Toolbars & tabs", exact: true }).click();
  return dialog;
}

test("desktop attached frame animates both ways, retains edits and supports detached/bottom variants", async ({ page, baseURL }, info) => {
  await io(page, baseURL!);
  let dialog = await settings(page);
  await dialog.getByRole("combobox", { name: "Workspace layout" }).selectOption("floating");
  await dialog.getByRole("button", { name: /Close/ }).click();
  const side = page.getByRole("complementary", { name: "Right sidebar", exact: true });
  await expect(side).toHaveAttribute("data-attachment", "attached");
  await expect(side).toHaveCSS("border-top-width", "1px");
  await expect(side.locator(".aui-tabbed-sidebar-content")).toHaveCSS("border-top-width", "0px");
  await expect(side).toHaveCSS("gap", "0px");
  const draft = side.getByRole("textbox", { name: "Component name", exact: true });
  await draft.fill("Retained component");
  await page.screenshot({ path: info.outputPath("attached-desktop.png") });
  for (const opening of [false, true]) {
    const samples = await side.evaluate(async element => {
      const heights: number[] = [element.getBoundingClientRect().height];
      element.querySelector<HTMLButtonElement>('button[aria-label="Properties"]')!.click();
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => { heights.push(element.getBoundingClientRect().height); if (performance.now() - start > 400) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      });
      return heights;
    });
    const low = Math.min(...samples), high = Math.max(...samples);
    expect(high).toBeGreaterThan(250);
    expect(low).toBeLessThan(60);
    expect(samples.some(height => height > low + 10 && height < high - 10)).toBe(true);
    await expect(side).toHaveAttribute("data-open", String(opening));
  }
  await expect(draft).toHaveValue("Retained component");
  dialog = await chrome(page);
  await dialog.getByRole("combobox", { name: "Sidebar tab placement" }).selectOption("tabs-bottom");
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(side).toHaveAttribute("data-tabs", "bottom");
  const bottom = (await side.boundingBox())!;
  await side.getByRole("button", { name: "Properties", exact: true }).click();
  await expect.poll(async () => (await side.boundingBox())!.height).toBeLessThan(60);
  const collapsed = (await side.boundingBox())!;
  expect(collapsed.y + collapsed.height).toBeCloseTo(bottom.y + bottom.height, 0);
  await side.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(draft).toHaveValue("Retained component");
  dialog = await chrome(page);
  await dialog.getByRole("combobox", { name: "Sidebar container" }).selectOption("detached");
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(side).toHaveAttribute("data-attachment", "detached");
  await expect(side).toHaveAttribute("data-tabs", "bottom");
  await expect(side).toHaveCSS("border-top-width", "0px");
  await expect(side.locator(".aui-tabbed-sidebar-content")).toHaveCSS("border-top-width", "1px");
  await page.screenshot({ path: info.outputPath("detached-bottom.png") });
  await page.reload();
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await expect(side).toHaveAttribute("data-attachment", "detached");
  await expect(side).toHaveAttribute("data-tabs", "bottom");
});

test("touch defaults to a combined card across viewport changes and respects reduced motion", async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1366, height: 1024 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await io(page, baseURL!);
    const side = page.getByRole("complementary", { name: "Right sidebar", exact: true });
    await expect(side).toHaveAttribute("data-attachment", "attached");
    await expect(side.getByRole("button", { name: "Properties", exact: true })).toHaveCSS("height", "44px");
    const dialog = await chrome(page);
    await dialog.getByRole("combobox", { name: "Sidebar container" }).selectOption("attached");
    await dialog.getByRole("button", { name: /Close/ }).click();
    await expect(side).toHaveAttribute("data-attachment", "attached");
    await expect(side).toHaveCSS("transition-duration", "0s");
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(side).toHaveAttribute("data-attachment", "attached");
    await side.getByRole("button", { name: "Properties", exact: true }).click();
    await expect(side).toHaveAttribute("data-expanded", "false");
    await expect(side.locator("[data-closing=true]")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("tablet-attached-override.png") });
  } finally { await context.close(); }
});

test("shared toolbar and tab preferences synchronize across IO and Map and can restore defaults", async ({ page, context, baseURL }) => {
  await io(page, baseURL!);
  const other = await context.newPage();
  await other.goto("/map/index.html?new=show");
  const dialog = await chrome(page);
  await dialog.getByRole("combobox", { name: "Sidebar tab placement" }).selectOption("tabs-bottom");
  await dialog.getByRole("combobox", { name: "Toolbar density" }).selectOption("compact");
  await dialog.getByRole("combobox", { name: "Ribbon appearance" }).selectOption("panel");
  await dialog.getByRole("combobox", { name: "Workspace selector" }).selectOption("strip");
  for (const target of [page, other]) {
    await expect(target.locator(".aui-shell")).toHaveAttribute("data-sidebar-variant", "tabs-bottom");
    const ribbon = target.locator(".aui-workspace-ribbon");
    await expect(ribbon).toHaveAttribute("data-density", "compact");
    await expect(ribbon).toHaveAttribute("data-appearance", "panel");
    await expect(ribbon).toHaveAttribute("data-workspace-layout", "strip");
  }
  await openAppSettings(other);
  const mapSettings = other.getByRole("dialog", { name: "Aether Map settings" });
  await mapSettings.getByRole("button", { name: "Toolbars & tabs", exact: true }).click();
  await expect(mapSettings.getByRole("combobox", { name: "Toolbar density" })).toHaveValue("compact");
  await mapSettings.getByRole("button", { name: "Restore toolbar and sidebar defaults" }).click();
  await expect(dialog.getByRole("combobox", { name: "Toolbar density" })).toHaveValue("app");
  await expect(page.locator(".aui-workspace-ribbon")).toHaveAttribute("data-density", "expanded");
  await expect(other.locator(".aui-shell")).toHaveAttribute("data-sidebar-variant", "tabs-top");
  await other.close();
});

test("toolbar and tab settings are reachable in Studio, CAD, Animation, Sketch and Vector", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  for (const app of ["studio", "cad", "animation", "sketch", "vector"]) {
    if (app !== "studio") expect((await page.request.post("/api/admin/apps", { headers: { Origin: baseURL! }, data: { id: app, enabled: true } })).ok()).toBe(true);
    await page.goto(app === "studio" ? "/" : `/${app}/index.html${app === "cad" ? "?new=part" : ""}`);
    if (app === "cad") await page.getByRole("button", { name: "Create Part", exact: true }).click();
    if (["cad", "animation", "sketch"].includes(app)) await openAppSettings(page);
    else if (app === "vector") {
      await page.locator('.suite-settings > summary').click();
      await page.locator('.suite-settings').getByRole('button', { name: 'Settings', exact: true }).click();
    }
    else {
      await page.getByRole("button", { name: /^Interface theme:/ }).click();
      await page.getByRole("menuitem", { name: "Appearance & icons…" }).click();
    }
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Toolbars & tabs", exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: "Sidebar container" })).toHaveValue("attached");
    await dialog.getByRole("combobox", { name: "Sidebar container" }).selectOption("attached");
    await expect(dialog.getByRole("combobox", { name: "Panel animation" })).toHaveValue("auto");
  }
});


test("screenshot-sized window keeps legacy automatic side rails in a single card", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 1080, height: 820 });
  await signIn(page, baseURL!);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('aether.workspace-chrome.v1', JSON.stringify({sidebarAttachment:'auto', sidebarDesign:'rail'})));
  expect((await page.request.post("/api/admin/apps", { headers: { Origin: baseURL! }, data: { id: "io", enabled: true } })).ok()).toBe(true);
  await page.goto('/io/');
  await createIOProject(page);
  for (const name of ['Left sidebar','Right sidebar']) {
    const card = page.getByRole('complementary', {name, exact:true});
    await expect(card).toHaveAttribute('data-attachment','attached');
    await expect(card).toHaveCSS('gap','0px');
    await expect(card).toHaveCSS('border-top-width','0px');
    await expect(card).toHaveCSS('border-radius','0px');
    await expect(card).toHaveCSS('box-shadow','none');
    for (const child of ['.aui-tabbed-sidebar-tabs','.aui-tabbed-sidebar-content']) {
      await expect(card.locator(child)).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(card.locator(child)).toHaveCSS('border-top-width','0px');
      await expect(card.locator(child)).toHaveCSS('box-shadow','none');
    }
    const joined = await card.evaluate(node => {
      const tray = node.querySelector('.aui-tabbed-sidebar-tabs')!.getBoundingClientRect();
      const body = node.querySelector('.aui-tabbed-sidebar-content')!.getBoundingClientRect();
      return Math.min(Math.abs(tray.right-body.left),Math.abs(body.right-tray.left));
    });
    expect(joined).toBeLessThanOrEqual(1);
  }
  await page.screenshot({path:info.outputPath('io-combined-1080.png'),animations:'disabled'});
  await page.reload();
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Right sidebar',exact:true})).toHaveAttribute('data-attachment','attached');
});
