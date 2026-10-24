import { expect, test, type Page } from "@playwright/test";

/**
 * The library table's Details tray. It used to open by default, taking room
 * from the list that is the point of the page.
 */

async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}

const tray = (page: Page) => page.locator(".library-details");
const toggle = (page: Page) => page.getByRole("button", { name: /Details/ }).first();

test("the details tray starts closed and opens only when asked", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await expect(toggle(page)).toBeVisible();
  await expect(tray(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");

  await toggle(page).click();
  await expect(tray(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");

  await toggle(page).click();
  await expect(tray(page)).toHaveCount(0);
});

test("it stays closed across reloads, and remembers being opened", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await page.reload();
  await expect(toggle(page)).toBeVisible();
  await expect(tray(page)).toHaveCount(0);

  await toggle(page).click();
  await expect(tray(page)).toBeVisible();
  await page.reload();
  // Opened on purpose, so it comes back open — that is the person's choice.
  await expect(tray(page)).toBeVisible();

  await toggle(page).click();
  await expect(tray(page)).toHaveCount(0);
});

test("the preference is per application", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await toggle(page).click();
  await expect(tray(page)).toBeVisible();

  await page.goto("/cad/");
  await expect(toggle(page)).toBeVisible();
  await expect(tray(page)).toHaveCount(0);
});
