import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { openOutput, ribbon, signIn, clickRibbon, switchWorkspace, openTimeline } from "./helpers";

test("real video follows scrubbing, holds its last frame and pauses at the explicit sequence end", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await openTimeline(page);
  await page.getByRole("button", { name: "Timeline settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Timeline playback" }).selectOption("loop");
  await page.getByRole("textbox", { name: "Sequence length" }).fill("6");
  await page.getByRole("textbox", { name: "Sequence length" }).press("Enter");
  await page.keyboard.press("Escape");
  const chooser = page.waitForEvent("filechooser");
  await clickRibbon(page, "Add Media");
  await (await chooser).setFiles(resolve("e2e/fixtures/timing.webm"));
  const preview = page.locator(".map-surface video");
  await expect(preview).toBeVisible();
  const output = await openOutput(page);
  const projected = output.locator(".map-surface video");
  await switchWorkspace(page, "Sequence");
  await expect(page.locator(".map-clip")).toHaveCount(1);
  const ruler = (await page.locator(".map-ruler").boundingBox())!;
  const edge = (await page.locator(".map-clip-edge--end").boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(ruler.x + ruler.width * 5 / 6, edge.y + edge.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Loop instead" })).toBeVisible();
  const seek = async (timeS: number) => page.mouse.click(ruler.x + ruler.width * timeS / 6, ruler.y + ruler.height / 2);
  await seek(3);
  for (const video of [preview, projected]) {
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(1.8);
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  }
  await seek(1);
  for (const video of [preview, projected]) {
    await expect.poll(() => video.evaluate((el) => Math.abs((el as HTMLVideoElement).currentTime - 1))).toBeLessThan(0.1);
  }
  await page.getByRole("button", { name: "Timeline settings", exact: true }).click();
  await page.getByLabel("Timeline playback").selectOption("once");
  await page.keyboard.press("Escape");
  await seek(5.7);
  await clickRibbon(page, "Play");
  await expect(ribbon(page, "Pause")).toHaveCount(0);
  await expect(ribbon(page, "Play")).toBeVisible();
});
