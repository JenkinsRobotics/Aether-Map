import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * One output window per output, and it only ever plays the current render.
 *
 * The bug: the editor minted a new channel id on every mount, so reloading it
 * orphaned the window already aimed at the projector — that window kept
 * animating its last frame on a channel nobody published to, while the next
 * Open created a second window beside it.
 */

async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}

/** Open an output the way the editor does, without depending on the Output
 *  dialog's current shape: same URL, same session, same window name. */
async function openOutputWindow(page: Page, context: BrowserContext, outputID = "out-1") {
  const session = await sessionOf(page);
  const query = new URLSearchParams({
    output: "1",
    session: session!,
    windowKind: "monitor",
    outputID,
  });
  const output = await context.newPage();
  await output.goto(`/map/index.html?${query}`);
  await output.waitForSelector(".map-output");
  return output;
}

const sessionOf = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("aether-map.output-session"));

test("the editor keeps one output session across a reload", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show&scope=personal");
  await page.waitForSelector(".map-canvas-host");
  const before = await sessionOf(page);
  expect(before).toBeTruthy();

  await page.reload();
  await page.waitForSelector(".map-canvas-host");
  // Same channel and the same window names, so the window already on the
  // projector is reconnected rather than abandoned.
  expect(await sessionOf(page)).toBe(before);
});

test("an output that loses its editor stops playing and says so", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show&scope=personal");
  await page.waitForSelector(".map-canvas-host");

  const output = await openOutputWindow(page, context);
  // It links as soon as the editor's next heartbeat lands.
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live", {
    timeout: 10_000,
  });
  await expect(output.locator(".map-output-unlinked")).toHaveCount(0);

  // Take the editor away. The output must notice rather than animate on.
  await page.close();
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "lost", {
    timeout: 20_000,
  });
  await expect(output.getByText(/holding its last frame/)).toBeVisible();
});

test("two editors on one saved show target the same output window", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(page, baseURL!);

  // A saved show, made through the library API so this does not depend on the
  // editor's Save controls.
  const created = await page.request.post(`${baseURL}/api/library/create`, {
    headers: { Origin: baseURL!, "Content-Type": "application/json" },
    data: {
      app: "map",
      kind: "file",
      name: "Shared output show.aethermap",
      scope: "personal",
      parent: null,
      data_base64: Buffer.from(
        JSON.stringify({ version: 2, output: { width: 1920, height: 1080 } }),
      ).toString("base64"),
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/map/index.html?document=${id}`);
  await page.waitForSelector(".map-canvas-host");

  // A second editor on the same document, in its own tab.
  const second = await context.newPage();
  await second.goto(`/map/index.html?document=${id}`);
  await second.waitForSelector(".map-canvas-host");

  // The observable guarantee: an output opened on the document's channel is fed
  // by an editor on that document — so both editors address one window, rather
  // than each opening its own onto the same projector.
  const query = new URLSearchParams({
    output: "1",
    session: `doc-${id}`,
    windowKind: "monitor",
    outputID: "out-1",
  });
  const output = await context.newPage();
  await output.goto(`/map/index.html?${query}`);
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live", {
    timeout: 10_000,
  });

  // Closing one editor leaves the other still driving that same window.
  await page.close();
  await second.bringToFront();
  await output.waitForTimeout(3000);
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live");
});

test("a window opened on a draft follows the editor when autosave names the show", async ({
  page,
  context,
  baseURL,
}) => {
  // The regression: an unsaved show's channel is a per-tab draft id, and
  // autosave later renames it to `doc-<id>`. The window already aimed at the
  // projector went on listening to the draft name — it held the frame it had
  // when the show was saved, and every later edit, scene change included, went
  // only to the editor. A projector stuck on the previous scene mid-show.
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show&scope=personal");
  await page.waitForSelector(".map-canvas-host");
  const draft = await sessionOf(page);
  expect(draft).toBeTruthy();

  const output = await openOutputWindow(page, context);
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live", {
    timeout: 10_000,
  });

  // Let autosave give the show a document id, which renames the channel.
  // A new mapping surface is committed immediately and triggers autosave.
  await page.getByRole("group", { name: "Layer controls" }).first()
    .getByRole("button", { name: "More Layer controls" }).click();
  await page.getByRole("menuitem", { name: "New Surface" }).click();
  await expect(page).toHaveURL(/[?&]document=/, { timeout: 15_000 });

  // The window followed rather than being orphaned: still live, on the new
  // channel, and showing the surface that was added after the rename.
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live", {
    timeout: 10_000,
  });
  await expect(output.locator(".map-surface")).toHaveCount(1, { timeout: 10_000 });
  await expect(output).toHaveURL(new RegExp(`session=doc-`));
  expect(await sessionOf(page)).toBe(draft);
});
