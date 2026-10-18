import { expect, test } from "@playwright/test";
import { clickRibbon, openOutputProperties, openPanel, signIn } from "./helpers";

/**
 * The display picker's Chromium path, with the window-management permission
 * granted the way a user would grant it. Headless has one screen, so this
 * proves the API is reached and the picker reflects it — not that a window
 * lands on a second projector, which needs real hardware.
 */
test("lists attached displays in Chrome and offers to match the raster", async ({
  page,
  context,
  baseURL,
}) => {
  // Playwright has no name for this permission; Chrome's own protocol does.
  // It must be granted on *this* browser context — a page-level session
  // grants on the default context, which Playwright's pages never use.
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const { browserContextIds } = await browserCdp.send("Target.getBrowserContexts");
  await browserCdp.send("Browser.grantPermissions", {
    browserContextId: browserContextIds[browserContextIds.length - 1],
    origin: baseURL!,
    permissions: ["windowManagement"],
  });

  const login = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL!, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/map/index.html?new=show&scope=personal");

  // The API exists here; the picker must not claim the browser lacks it.
  expect(await page.evaluate(() => typeof (window as never as { getScreenDetails?: unknown }).getScreenDetails)).toBe("function");
  const monitor = await openOutputProperties(page);
  await expect(page.getByText(/needs Chrome, Edge/)).toHaveCount(0);
  await monitor.getByText("Choose a detected display", { exact: true }).click();
  await expect(monitor.getByRole("button", { name: "Scan displays", exact: true })).toBeVisible();

  await monitor.getByRole("button", { name: "Scan displays", exact: true }).click();
  await expect(monitor.getByText(/\d+ displays? detected\./)).toBeVisible();
  const options = await monitor.locator("select option").allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(1);
  expect(options[0]).toMatch(/\d+×\d+/);

  // Matching the raster to the chosen display changes the show's output.
  const chosen = options[0].match(/(\d+)×(\d+)/)!;
  await monitor.getByRole("button", { name: "Match display size", exact: true }).click();
  await expect(monitor.getByRole("button", { name: "Match display size", exact: true })).toBeDisabled();
  await openPanel(page, "Properties");
  // NumberField writes its value through a ref, not a value attribute, so
  // read the live values rather than querying by attribute.
  await expect
    .poll(() => page.locator("input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)))
    .toEqual(expect.arrayContaining([chosen[1], chosen[2]]));
});

for (const availability of ["unsupported", "denied"] as const) {
  test(`movable output window reports its own size when display enumeration is ${availability}`, async ({ page, baseURL }, info) => {
    await signIn(page, baseURL!);
    await page.addInitScript((availability) => {
      Object.defineProperty(window, "getScreenDetails", {
        configurable: true,
        value: availability === "unsupported" ? undefined : async () => { throw new DOMException("Denied", "NotAllowedError"); },
      });
    }, availability);
    await page.goto("/map/index.html?new=show");
    await clickRibbon(page, "New Surface");
    const monitor = await openOutputProperties(page);
    await expect(monitor.getByText("No output window connected", { exact: true })).toBeVisible();
    await expect(monitor.getByRole("combobox")).toHaveCount(0);
    if (availability === "unsupported") {
      await expect(monitor.locator("details")).toHaveCount(0);
    } else {
      await monitor.getByText("Choose a detected display", { exact: true }).click();
      await monitor.getByRole("button", { name: "Scan displays", exact: true }).click();
      await expect(monitor.getByText(/Displays could not be listed/)).toBeVisible();
    }
    const popup = page.waitForEvent("popup");
    await monitor.getByRole("button", { name: "Open output window", exact: true }).click();
    const output = await popup;
    await expect(output.locator(".map-surface")).toHaveCount(1);
    await output.setViewportSize({ width: 1280, height: 720 });
    await expect(monitor.locator(".map-device-size")).toHaveText("1280×720 px");
    await expect(monitor.getByText(/Output resolution: 1920×1080 px/)).toBeVisible();
    const pages = page.context().pages().length;
    await monitor.getByRole("button", { name: "Open output window", exact: true }).click();
    expect(page.context().pages().length).toBe(pages);
    await monitor.getByRole("button", { name: "Match window size", exact: true }).click();
    await expect(monitor.getByText(/Output resolution: 1280×720 px · matches output window/)).toBeVisible();
    await expect(output.locator(".map-output-raster")).toHaveCSS("width", "1280px");
    await expect(output.locator(".map-output-raster")).toHaveCSS("height", "720px");
    await output.setViewportSize({ width: 1024, height: 768 });
    await expect(monitor.locator(".map-device-size")).toHaveText("1024×768 px");
    await expect(monitor.getByRole("button", { name: "Match window size", exact: true })).toBeEnabled();
    await output.locator(".map-output").dblclick();
    await expect(monitor.getByText(/Fullscreen content size/)).toBeVisible();
    const size = await output.evaluate(() => `${innerWidth}×${innerHeight} px`);
    await expect(monitor.locator(".map-device-size")).toHaveText(size);
    await monitor.screenshot({ path: info.outputPath(`${availability}-output-window-size.png`) });
    await output.close();
    await expect(monitor.getByText("No output window connected", { exact: true })).toBeVisible();
    await expect(monitor.locator(".map-device-size")).toHaveCount(0);
    // A blocked popup must not leave a guessed screen size in the panel.
    await page.evaluate(() => { window.open = () => null; });
    await monitor.getByRole("button", { name: "Open output window", exact: true }).click();
    await expect(page.getByText("Allow pop-ups to open the projector output.", { exact: true })).toBeVisible();
    await expect(monitor.getByText("No output window connected", { exact: true })).toBeVisible();
  });
}
