import { expect, test, type Page } from "@playwright/test";
import { switchWorkspace, openBottomDock } from "./helpers";

/**
 * The suite bottom tray: a truthful connection light and the workspace name,
 * with the identity and appearance controls left to the header where they
 * already live.
 */

async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}

const tray = (page: Page) => page.locator(".studio-tray");

test("the tray leads with a connection light beside Aether Studio", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await expect(tray(page)).toBeVisible();

  const light = tray(page).locator(".studio-tray-connection");
  await expect(light).toBeVisible();
  await expect(light.locator(".aui-status-dot")).toHaveClass(/aui-status-dot--ok/);
  await expect(light.getByText("Aether Studio")).toBeVisible();
  await expect(light).toHaveAttribute("title", /Connected/);

  // The dot comes first, then the name.
  const order = await light.evaluate((el) =>
    Array.from(el.children).map((child) => child.className.toString()),
  );
  expect(order[0]).toContain("aui-status-dot");
  expect(order[1]).toContain("studio-tray-name");
});

test("the workspace name sits on the right, with no identity or theme control", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");

  await expect(tray(page).locator(".studio-tray-workspace")).toHaveText("E2E Workspace");
  await expect(tray(page).getByText("End to End")).toHaveCount(0);
  await expect(tray(page).locator("button")).toHaveCount(0);

  // Both still exist where they belong — in the header.
  await expect(page.locator(".library-top aether-account")).toHaveCount(1);
  await expect(page.locator(".library-top").getByRole("button", { name: /appearance/i })).toBeVisible();
});

test("the light turns red when the server cannot be reached", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  const dot = tray(page).locator(".studio-tray-connection .aui-status-dot");
  await expect(dot).toHaveClass(/aui-status-dot--ok/);

  test.setTimeout(65_000);
  // Take the server away underneath it; the tray must stop claiming connected.
  await page.route("**/api/status", (route) => route.abort());
  await expect(dot).toHaveClass(/aui-status-dot--error/, { timeout: 25_000 });
  await expect(tray(page).locator(".studio-tray-connection")).toHaveAttribute(
    "title",
    /Cannot reach/,
  );

  // And recovers on its own once it answers again.
  await page.unroute("**/api/status");
  await expect(dot).toHaveClass(/aui-status-dot--ok/, { timeout: 25_000 });
});

test("mapping opens on the surfaces bar, and each room remembers its own tray", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();

  // Mapping asks "which shape is that one?", and the strip answers it.
  await expect(page.locator(".map-surfaces")).toBeVisible();

  // Visualization opens the timeline and surface strip together.
  await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-surfaces")).toBeVisible();
  await openBottomDock(page, "Timeline");
  await expect(page.locator(".map-timeline")).toBeVisible();
  await expect(page.locator(".map-surfaces")).toBeVisible();

  // A choice made in one room is that room's, and survives leaving it.
  await page.getByRole("toolbar", {name:"Map workspace dock tabs"}).getByRole("button", {name:"Timeline",exact:true}).click();
  await expect(page.locator(".map-timeline")).toHaveCount(0);
  await expect(page.getByRole("complementary", {name:"Audio mixer"})).toHaveCount(0);
  await switchWorkspace(page, "Mapping");
  await expect(page.locator(".map-surfaces")).toBeVisible();
  await switchWorkspace(page, "Sequence");
  await expect(page.locator(".map-timeline")).toHaveCount(0);
  await expect(page.getByRole("complementary", {name:"Audio mixer"})).toHaveCount(0);

  // And it outlives a reload, like the ribbon tab beside it.
  await page.reload();
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await expect(page.locator(".map-surfaces")).toBeVisible();
});
