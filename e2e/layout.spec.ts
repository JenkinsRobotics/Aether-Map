import { clickRibbon, saveShow, signIn, switchWorkspace } from "./helpers";
import { expect, test, type Page } from "@playwright/test";

async function expectWindowBounded(page: Page) {
  // Sample several frames: a single snapshot misses ResizeObserver feedback
  // that gradually pushes the timeline and status bar out of the window.
  const samples = await page.evaluate(async () => {
    const bottom = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().bottom;
    const result = [];
    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      result.push({
        window: innerHeight,
        document: document.documentElement.scrollHeight,
        workspace: bottom(".map-editor-workspace"),
        shell: bottom(".aui-shell"),
        status: bottom(".aui-status-bar"),
        stage: bottom(".map-stage"),
        tray: bottom(".aui-workspace-bottom-dock > .aui-tabbed-sidebar"),
      });
    }
    return result;
  });
  for (const sample of samples) {
    expect(sample.document).toBe(sample.window);
    expect(sample.workspace).toBeCloseTo(sample.window, 0);
    expect(sample.shell).toBeCloseTo(sample.window, 0);
    expect(sample.status).toBeCloseTo(sample.window, 0);
    expect(sample.tray).toBeLessThan(sample.status);
    expect(sample.stage).toBeCloseTo(samples[0].stage, 0);
  }
}

test("editor stays within the window while idle, resizing, and adjusting the tray", async ({ page, baseURL }) => {
  const response = await page.request.post("/api/login", {
    headers: { Origin: baseURL! },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/map/index.html?new=show&scope=personal");
  await expect(page.locator(".map-tray")).toBeVisible();

  for (const viewport of [
    { width: 3455, height: 1292 },
    { width: 1600, height: 1000 },
    { width: 1024, height: 640 },
    { width: 800, height: 500 },
    { width: 3455, height: 1292 },
  ]) {
    await page.setViewportSize(viewport);
    await expectWindowBounded(page);
  }

  const separator = page.getByRole("separator", { name: "Resize bottom dock", exact: true });
  const before = (await page.locator(".map-tray").boundingBox())!;
  const handle = (await separator.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await page.locator(".map-tray").boundingBox())!.height).toBeGreaterThan(before.height + 100);
  await expectWindowBounded(page);

  await page.reload();
  await expect(page.locator(".map-tray")).toBeVisible();
  await expectWindowBounded(page);
  // Each room remounts its shell: the stage observer must follow the new node.
  for (const room of ["Sequence", "Mapping"] as const) {
    await switchWorkspace(page, room);
    await page.setViewportSize({ width: 1024, height: 640 });
    await expectWindowBounded(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expectWindowBounded(page);
  }
});

test("turning the input preview off keeps it off across reloads", async ({ page, baseURL }) => {
  // It used to be component state, so every reload turned it back on — and Map
  // reloads on save and on rename, which reads as the editor overruling you.
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await switchWorkspace(page, "Visualization");
  const preview = page.locator(".map-input-preview");
  await expect(preview).toBeVisible();

  await clickRibbon(page, "Input preview");
  await expect(preview).toBeHidden();

  await page.reload();
  await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-canvas-host").first()).toBeVisible();
  await expect(preview).toBeHidden();
  // Saving reloads too; the preference has to survive that as well.
  await saveShow(page, "Input preference");
  await expect(preview).toBeHidden();

  // And turning it back on is remembered just as firmly.
  await clickRibbon(page, "Input preview");
  await expect(preview).toBeVisible();
  await page.reload();
  await switchWorkspace(page, "Visualization");
  await expect(preview).toBeVisible();
});
