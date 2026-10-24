import { expect, test } from "@playwright/test";
import { openAppSettings, clickRibbon, openOutput, signIn, saveShow } from "./helpers";

test("Global application sidebar saves shows, shares links and keeps output through layout changes", async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  // Exercise the fallback used when a browser denies clipboard writes.
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
  }));
  await page.goto("/map/index.html?new=show");
  const header = page.getByRole("complementary", {name:"Aether Map sidebar",exact:true});
  await expect(page).toHaveURL(/document=/);
  await expect(header.getByRole("button", { name: "Copy document link", exact: true })).toBeEnabled();
  await expect(page.getByRole("tab", {name:"Untitled show", exact:true})).toBeVisible();
  await expect(header.locator(".map-doc-name, .map-save-state")).toHaveCount(0);
  await expect(header.locator("[data-aether-account]")).toContainText("End to End");
  const left = header;
  for (const name of ["Aether Studio applications", "Document controls", "Copy document link"]) {
    await expect(left.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const right = header;
  for (const name of ["Studio mode: Docked", "Workspace windows and tabs"]) {
    await expect(right.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await clickRibbon(page, "New Surface");
  await saveShow(page,"Projection demo");
  const id = new URL(page.url()).searchParams.get("document");
  await expect(page.getByRole("tab", {name:"Projection demo", exact:true})).toBeVisible();
  await expect(page.locator(".map-file-tabs").getByRole("status")).toHaveText("Saved");
  await header.getByRole("button", { name: "Copy document link", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Document link" });
  const link = new URL(await linkDialog.getByRole("textbox").inputValue());
  expect(link.pathname).toBe("/map/index.html");
  expect(link.searchParams.get("document")).toBe(id);
  expect(link.searchParams.has("new")).toBe(false);
  await linkDialog.getByRole("button", { name: "Done" }).click();

  const output = await openOutput(page);
  const viewport = await page.locator(".map-stage").elementHandle();
  // Presets cycle Docked → Canvas → Floating → Docked.
  for (const label of ["Docked", "Canvas", "Floating"]) {
    await header.getByRole("button", { name: `Studio mode: ${label}`, exact: true }).click();
    expect(await viewport!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(output.locator(".map-surface")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1000);
  }
  await openAppSettings(page);
  const settings = page.getByRole("dialog", { name: "Aether Map settings" });
  await settings.getByRole("combobox", { name: "Workspace layout" }).selectOption("floating");
  await settings.getByRole("button", { name: "Close Aether Map settings" }).click();
  await expect(header.getByRole("button", { name: "Studio mode: Floating", exact: true })).toBeVisible();
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await page.reload();
  await expect(header.getByRole("button", { name: "Studio mode: Floating", exact: true })).toBeVisible();
  await expect(page.locator(".map-surface")).toHaveCount(1);
  await header.getByRole("button", { name: "Studio mode: Floating", exact: true }).click();
  await header.locator('.suite-settings > summary').click();
  await header.getByRole('combobox', {name:'Theme'}).selectOption('dark');
  await page.setViewportSize({ width: 1968, height: 1000 });
  await header.screenshot({ path: info.outputPath("map-cad-style-header.png") });
  await page.screenshot({ path: info.outputPath("map-cad-style-workspace.png") });
  for (const width of [800, 640, 480]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(header.locator('.suite-settings > summary')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(700);
  }
});
