import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, openOutput, saveShow, signIn } from "./helpers";

const canvas = (page: Page) => page.locator(".map-canvas-host").first();
const openSettings = async (page: Page) => {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("aether-open-settings", { cancelable: true })));
  const window_ = page.getByRole("dialog", { name: "Aether Map settings" });
  await expect(window_).toBeVisible();
  await window_.getByRole("button", { name: "Surfaces" }).click();
  return window_;
};

test("a plane can look one way on screen and another on the wall", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await clickRibbon(page, "New Surface");
  await expect(canvas(page).locator(".map-surface-grid")).toHaveCount(1);
  await saveShow(page, "Surface look");
  const output = await openOutput(page);
  await expect(output.locator(".map-output-raster")).toBeVisible();

  const settings = await openSettings(page);
  const sides = settings.getByRole("radiogroup", { name: "Where this look applies" });
  const pattern = settings.getByRole("radiogroup", { name: "Pattern", exact: true });

  // One side at a time, switched here; give each a different pattern, which is
  // the whole point of there being two.
  await sides.getByRole("radio", { name: "Device" }).click();
  await pattern.getByRole("radio", { name: "Fill" }).click();
  await sides.getByRole("radio", { name: "External" }).click();
  await pattern.getByRole("radio", { name: "Checkerboard" }).click();
  await settings.getByRole("button", { name: "Close Aether Map settings" }).click();

  // The editor shows a plain field: no grid lines, no checker squares.
  const editorGrid = canvas(page).locator(".map-surface-grid").first();
  await expect(editorGrid.locator("line")).toHaveCount(0);
  await expect(editorGrid.locator("rect")).toHaveCount(2);
  // The projector shows squares at the same instant — 6 x 6, half of them.
  const projected = output.locator(".map-surface-grid").first();
  await expect(projected.locator("rect")).toHaveCount(20);

  // Colours are the setting's, not the stylesheet's.
  const settingsAgain = await openSettings(page);
  // The pane opens on Device; the colour being set is the projector's.
  await settingsAgain.getByRole("radiogroup", { name: "Where this look applies" })
    .getByRole("radio", { name: "External" }).click();
  await settingsAgain.getByRole("textbox", { name: "Primary colour", exact: true }).fill("#123456");
  await settingsAgain.getByRole("textbox", { name: "Primary colour", exact: true }).press("Enter");
  await settingsAgain.getByRole("button", { name: "Close Aether Map settings" }).click();
  await expect(projected.locator("rect").first()).toHaveAttribute("fill", "#123456");

  // And it saves: a look is part of the show, not of this browser.
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page).locator(".map-surface-grid line")).toHaveCount(0);
  await output.close();
});

test("sections and pin size are live, and defaults can be restored per side", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await clickRibbon(page, "New Surface");
  await expect(canvas(page).locator(".map-surface-grid")).toHaveCount(1);

  const settings = await openSettings(page);
  // The editor default is a checkerboard; a grid is what has countable lines.
  await settings.getByRole("radiogroup", { name: "Pattern", exact: true })
    .getByRole("radio", { name: "Grid", exact: true }).click();
  const sections = settings.getByRole("textbox", { name: "Sections" });
  await sections.fill("12");
  await sections.press("Enter");
  await settings.getByRole("button", { name: "Close Aether Map settings" }).click();
  // Twelve sections is eleven interior lines each way.
  await expect(canvas(page).locator(".map-surface-grid line")).toHaveCount(22);

  const again = await openSettings(page);
  await again.getByRole("slider", { name: "Pin size" }).fill("20");
  await again.getByRole("button", { name: "Restore to defaults" }).click();
  // Restoring puts the editor back to its default pin size and pattern...
  await expect(again.getByRole("slider", { name: "Pin size" })).toHaveValue("9");
  await again.getByRole("button", { name: "Close Aether Map settings" }).click();
  await expect(canvas(page).locator(".map-surface-grid line")).toHaveCount(0);
});
