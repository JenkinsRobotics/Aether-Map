import { expect, test, type Page } from "@playwright/test";

/**
 * The suite app launcher in the application header: every Aether application
 * one click from every other, the way Microsoft 365's waffle works.
 */

async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}

const launcher = (page: Page) => page.getByRole("button", { name: /applications/i }).first();

test("the launcher is the first control and lists the suite's apps", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");

  // First in the header, before the application's own identity.
  const order = await page.evaluate(() => {
    const header = document.querySelector(".library-top")!;
    return Array.from(header.children).map((child) => child.className.toString().slice(0, 30));
  });
  expect(order[0]).toContain("aui-app-launcher-button");

  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
  await launcher(page).click();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");

  const menu = page.locator(".aui-app-launcher");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Aether Studio")).toBeVisible();

  // The apps this account may open, the current one marked.
  const names = await menu.locator(".aui-app-launcher-app strong").allTextContents();
  expect(names).toContain("Aether Map");
  expect(names).toContain("Aether CAD");
  expect(names.length).toBeGreaterThanOrEqual(2);
  await expect(menu.locator('[aria-current="page"] strong')).toHaveText("Aether Map");
});

test("the launcher opens another application, and closes on Escape", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");

  await launcher(page).click();
  await expect(page.locator(".aui-app-launcher")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".aui-app-launcher")).toHaveCount(0);

  await launcher(page).click();
  await page.locator(".aui-app-launcher-app", { hasText: "Aether CAD" }).click();
  await expect(page).toHaveURL(/\/cad\/$/);
  await expect(page.locator(".library-top strong").first()).toHaveText("Aether CAD");
});

test("the header shows the application, not the business name", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await expect(page.locator(".library-top strong").first()).toHaveText("Aether Map");
  // The workspace name used to sit beside it; the sidebar still carries it.
  await expect(page.locator(".library-top .library-workspace")).toHaveCount(0);
  await expect(page.getByText("E2E Workspace").first()).toBeVisible();
});
