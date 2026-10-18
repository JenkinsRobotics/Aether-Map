import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { openOutput, openTimeline, saveShow, signIn, clickRibbon } from "./helpers";

const capture = resolve(tmpdir(), `aether-map-hands-${process.pid}.y4m`);
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${capture}`] } });
test.beforeAll(() => {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-loop", "1", "-i", resolve("e2e/fixtures/right_hands.jpg"), "-vf", "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2", "-t", "1", "-r", "10", "-pix_fmt", "yuv420p", capture, "-y"]);
});
test.afterAll(() => rmSync(capture, { force: true }));

test("real camera transport, actual hand inference, recording, save and offline replay", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120000);
  await context.grantPermissions(["camera"]);
  await signIn(page, baseURL!); await page.goto("/map/index.html?new=show");
  // Mapping opens on the Surfaces tray; the timeline's controls exist once it
  // is the chosen workspace.
  await openTimeline(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await clickRibbon(page, "Webcam");
  await page.getByRole("button", { name: "Connect camera", exact: true }).click();
  await expect(page.locator(".map-surface video")).toHaveAttribute("data-camera-connected", "true");
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const output = await openOutput(page);
  await expect(output.locator(".map-surface video")).toHaveAttribute("data-camera-connected", "true");
  await expect.poll(() => output.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  // Content appends to the selected surface, so give the tracker one of its
  // own: the camera and the tracker have to project side by side here.
  await clickRibbon(page, "New Surface");
  await clickRibbon(page, "Tracker");
  await page.getByRole("button", { name: "Start tracking", exact: true }).click();
  await expect.poll(async () => Number(await page.locator(".map-surface .map-tracker").getAttribute("data-hands")), { timeout: 45000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await output.locator(".map-tracker").getAttribute("data-hands")), { timeout: 10000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Record hands", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByText("Recording saved in this feature.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(output.locator(".map-surface video")).toHaveAttribute("data-camera-connected", "false");
  await expect(page.locator(".map-surface .map-tracker")).not.toHaveAttribute("data-hands", "0");
  await expect(page.getByRole("region", { name: "Selection properties" })).toBeVisible();
  const documentID = await saveShow(page, "Recorded hands review");
  await page.screenshot({ path: info.outputPath("live-hands-recorded.png") });
  await page.reload();
  await openTimeline(page);
  await expect(page.locator(".map-surface .map-tracker")).not.toHaveAttribute("data-hands", "0");
  expect(new URL(page.url()).searchParams.get("document")).toBe(documentID);
  await output.close();
  // Once loaded, replay needs neither the camera nor any network/model request.
  await page.getByRole("tree", { name: "Layers", exact: true }).getByRole("treeitem", { name: /^Tracker(?: Hide Tracker)?$/ }).click();
  await context.setOffline(true);
  await page.getByLabel("Keyframe time", { exact: true }).fill("0.5");
  await page.getByLabel("Keyframe time", { exact: true }).press("Tab");
  await expect(page.locator(".map-surface .map-tracker")).not.toHaveAttribute("data-hands", "0");
  await expect(page.locator(".map-surface video")).toHaveAttribute("data-camera-connected", "false");
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
