import { expect, test } from "@playwright/test";
import { clickRibbon, openOutputProperties, openPanel, signIn } from "./helpers";

/**
 * A wireless receiver is an output like any other: it says what it is in the
 * Outputs tree, it reports the size of the picture it is sending, and the raster
 * can be matched to it. The browser and macOS own receiver selection — Map only
 * supplies the complete composition, cleanly.
 */
const tree = (page: import("@playwright/test").Page) =>
  page.getByRole("tree", { name: "Outputs", exact: true });
const rowIcon = (page: import("@playwright/test").Page) =>
  tree(page).getByRole("treeitem").first().locator("svg[data-icon]").first();

test("a wireless output reads as a wireless display and reports the picture it sends", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "New Surface");

  // A monitor output is a window, and says so.
  await openPanel(page, "Outputs");
  await expect(rowIcon(page)).toHaveAttribute("data-icon", "window");

  // Moving it to a wireless receiver changes what kind of thing it is, which is
  // the one fact the tree has to carry before anything is opened.
  const monitor = await openOutputProperties(page);
  await expect(monitor).toBeVisible();
  await page.getByRole("radio", { name: "Wireless" }).click();
  await expect(rowIcon(page)).toHaveAttribute("data-icon", "wireless");
  const wireless = page.locator(".map-wireless");
  await expect(wireless.getByText("No output window connected", { exact: true })).toBeVisible();

  // Both receivers are offered, and neither guesses at a receiver: the browser
  // and macOS own that choice.
  await expect(wireless.getByRole("button", { name: "Open Cast output tab" })).toBeVisible();
  await expect(wireless.getByRole("button", { name: "Open AirPlay output window" })).toBeVisible();

  const popup = page.waitForEvent("popup");
  await wireless.getByRole("button", { name: "Open AirPlay output window" }).click();
  const output = await popup;
  await expect(output).toHaveTitle("Aether Map — Output");
  // The receiver gets the composition and nothing else.
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await expect(output.locator(".map-handle, .map-zoom, .map-output-hint")).toHaveCount(0);

  // It reports its own picture size, exactly as a monitor window does, and the
  // raster can be matched to it — a mismatch is letterboxed by the receiver.
  await output.setViewportSize({ width: 1280, height: 720 });
  await expect(wireless.locator(".map-device-size")).toHaveText("1280×720 px");
  await expect(wireless.getByText(/Output resolution: 1920×1080 px\./)).toBeVisible();
  await wireless.getByRole("button", { name: "Match window size" }).click();
  await expect(wireless.getByText(/Output resolution: 1280×720 px · matches output window/)).toBeVisible();
  await expect(wireless.getByRole("button", { name: "Match window size" })).toBeDisabled();

  // And the tree row agrees with the projector rather than with the show
  // default: what it is, what it covers, and that it is live at that size.
  const row = tree(page).getByRole("treeitem").first();
  await expect(row).toHaveAccessibleName(/AirPlay/);
  // The scene it is linked to, by name: an output shows only that scene, so
  // "which scene" is a fact about this output rather than about the editor.
  await expect(row).toHaveAccessibleName(/Scene 1 · 1280 × 720/);
  await expect(row).toHaveAccessibleName(/Connected · 1280 × 720/);

  await output.close();
  await expect(wireless.getByText("No output window connected", { exact: true })).toBeVisible();
  await expect(tree(page).getByRole("treeitem").first()).toHaveAccessibleName(/No output window open/);
  // Still a wireless display when nothing is connected to it.
  await expect(rowIcon(page)).toHaveAttribute("data-icon", "wireless");
});
