import { expect, test } from "@playwright/test";
import { openOutput, openOutputProperties, signIn } from "./helpers";

test("the output box is the one canvas indicator for assignment and live state", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");

  const artboard = page.locator(".map-artboard.is-active");
  await expect(artboard).toBeVisible();
  // A new show already aims its one output at its one scene, so the canvas
  // says "aimed": the show as set up, before any projector is open.
  await expect(artboard).toHaveAttribute("data-projected", "aimed");

  // The blue region already communicates output assignment, so there is no
  // second output/device badge beside the scene name.
  const region = page.locator(".map-crop-overlay");
  await expect(region).toHaveCount(1);
  await expect(region).not.toHaveAttribute("data-live", /.*/);
  await expect(page.locator(".map-artboard-output")).toHaveCount(0);

  // Opening the window turns that same box green/live.
  const output = await openOutput(page);
  await expect(artboard).toHaveAttribute("data-projected", "live");
  await expect(region).toHaveAttribute("data-live", "true");

  // Closing it returns the same box to blue/aimed rather than removing it.
  await output.close();
  await expect(artboard).toHaveAttribute("data-projected", "aimed");
  await expect(region).not.toHaveAttribute("data-live", /.*/);
});

test("a scene nothing is aimed at carries no output box", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await page.getByRole("button", { name: "New scene", exact: true }).click();
  await page.getByRole("dialog", { name: "New scene", exact: true })
    .getByRole("button", { name: "Create", exact: true }).click();

  // The new scene becomes the one being edited, and no output points at it —
  // an unbound output is dark and never follows the active scene.
  const active = page.locator(".map-artboard.is-active");
  await expect(active).not.toHaveAttribute("data-projected", /.+/);
  // Scene 1 is still aimed at by output 1, and retains the blue output box.
  await expect(page.locator('.map-artboard:not(.is-active)[data-projected="aimed"]')).toHaveCount(1);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(1);
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(0);
  await expect(page.locator('.map-artboard[data-projected="live"]')).toHaveCount(0);

  // Pointing the output here moves that one box with it.
  await openOutputProperties(page);
  await page.getByRole("combobox", { name: "Scene shown on this output" })
    .selectOption({ label: "Scene 2" });
  await expect(active).toHaveAttribute("data-projected", "aimed");
  await expect(page.locator('.map-artboard[data-projected]')).toHaveCount(1);
  await expect(page.locator('.map-artboard.is-active .map-crop-overlay')).toHaveCount(1);
  await expect(page.locator('.map-artboard:not(.is-active) .map-crop-overlay')).toHaveCount(0);
});

/**
 * The outline is drawn a fixed number of screen pixels wide, counter-scaled
 * against the canvas zoom. Held at a plain 1px it thinned to a fraction of a
 * device pixel when zoomed out and rendered unevenly between the four edges.
 */
test("the artboard outline keeps its weight, and all four edges match", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  const artboard = page.locator(".map-artboard.is-active");
  await expect(artboard).toBeVisible();

  // The spread is in the artboard's own space; on screen it is that × zoom.
  const ringAt = () => artboard.evaluate((node) => ({
    zoom: Number(getComputedStyle(node).getPropertyValue("--map-zoom")) || 1,
    shadow: getComputedStyle(node).boxShadow,
  }));

  const before = await ringAt();
  // Zoom the canvas out hard; the ring must not thin with it.
  await page.locator(".map-canvas-host").hover();
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 240);
  const after = await ringAt();

  expect(after.zoom).toBeLessThan(before.zoom);
  // A ring declared as calc(2px / zoom) grows in artboard space exactly as the
  // zoom shrinks, which is what keeps it 2px on screen.
  const spreadOf = (shadow: string) => {
    const match = shadow.match(/rgb[^)]*\)\s+0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : NaN;
  };
  const screenBefore = spreadOf(before.shadow) * before.zoom;
  const screenAfter = spreadOf(after.shadow) * after.zoom;
  expect(screenBefore).toBeCloseTo(2, 1);
  expect(screenAfter).toBeCloseTo(2, 1);
});
