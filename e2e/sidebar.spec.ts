import { expect, test, type Page } from "@playwright/test";

/**
 * The shared `CollapsibleSidebar` (`@aether/ui`) on the application home pages.
 *
 * This lives here because this is the repo's only Playwright harness, and the
 * bug it guards is invisible to jsdom: the collapsed width is a CSS cascade
 * question, and jsdom applies no stylesheets. The sidebar collapsed its labels
 * but kept its full width, because a consumer's own single-class width rule
 * beat the shared single-class rail rule at equal specificity.
 */

const RAIL_MAX = 80;
const EXPANDED_MIN = 150;

async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post(`${baseURL}/api/login`, {
    headers: { Origin: baseURL, "Content-Type": "application/json" },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}

const sidebar = (page: Page) => page.locator(".aui-sidebar").first();
const width = (page: Page) =>
  sidebar(page).evaluate((el) => el.getBoundingClientRect().width);

/** The rail animates its width; geometry is only meaningful once it settles. */
async function settled(page: Page): Promise<number> {
  let last = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = await width(page);
    if (now === last) return now;
    last = now;
    await page.waitForTimeout(50);
  }
  return last;
}

for (const app of ["/map/", "/cad/"]) {
  test(`the ${app} home sidebar collapses to an icon rail and expands again`, async ({
    page,
    baseURL,
  }) => {
    await signIn(page, baseURL!);
    await page.goto(app);
    await expect(sidebar(page)).toBeVisible();

    const toggle = page.locator(".aui-sidebar-toggle").first();
    const labels = page.locator(".aui-sidebar-label");
    const expanded = await width(page);
    expect(expanded).toBeGreaterThan(EXPANDED_MIN);
    expect(await labels.first().isVisible()).toBe(true);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();

    // The whole point: the rail is narrow, not merely label-less.
    await expect.poll(() => width(page), { timeout: 2_000 }).toBeLessThan(RAIL_MAX);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await labels.first().isVisible()).toBe(false);

    // The icons stay reachable in the rail rather than being clipped by it.
    const icon = page.locator(".aui-sidebar nav button svg").first();
    const iconBox = (await icon.boundingBox())!;
    const railBox = (await sidebar(page).boundingBox())!;
    expect(iconBox.x).toBeGreaterThanOrEqual(railBox.x - 0.5);
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 0.5);

    await toggle.click();
    await expect.poll(() => width(page), { timeout: 2_000 }).toBeGreaterThan(EXPANDED_MIN);
    expect(await labels.first().isVisible()).toBe(true);
  });
}

for (const app of ["/map/", "/cad/"]) {
  test(`every ${app} rail row shares one icon column`, async ({ page, baseURL }) => {
    // The bug this guards: a consumer's own row rule beat the shared row
    // contract at equal specificity, so nav rows kept their expanded padding
    // on top of the icon's margin — icons 10px right of every other row, and
    // the row itself overflowing the rail.
    await signIn(page, baseURL!);
    await page.goto(app);
    await page.locator(".aui-sidebar-toggle").first().click();
    expect(await settled(page)).toBeLessThan(RAIL_MAX);

    const rows = await sidebar(page).evaluate((aside) => {
      const rail = aside.getBoundingClientRect();
      const marks = Array.from(
        aside.querySelectorAll(
          ".library-create-plus, nav button svg, .library-workspace-tile, .aui-sidebar-row svg",
        ),
      );
      return marks.map((mark) => {
        const box = mark.getBoundingClientRect();
        const row = (mark.closest("button") ?? mark).getBoundingClientRect();
        return {
          centre: box.x + box.width / 2 - rail.x,
          size: box.width,
          overflow: row.x + row.width - (rail.x + rail.width),
          // The Create button's "+" is a text glyph filling its row, not an
          // icon in the slot; its centre still has to line up with the rest.
          isIcon: mark.tagName.toLowerCase() === "svg" ||
            mark.classList.contains("library-workspace-tile"),
        };
      });
    });

    expect(rows.length).toBeGreaterThanOrEqual(6);
    const railCentre = (await sidebar(page).boundingBox())!.width / 2;
    for (const row of rows) {
      expect(Math.abs(row.centre - railCentre)).toBeLessThanOrEqual(1);
      expect(row.overflow).toBeLessThanOrEqual(0);
      // One icon slot: a row rendering its icon at its natural size stands out.
      if (row.isIcon) {
        expect(row.size).toBeGreaterThanOrEqual(15);
        expect(row.size).toBeLessThanOrEqual(22);
      }
    }
  });
}

test("every interactive sidebar row answers the pointer", async ({ page, baseURL }) => {
  // Only the toggle and Create used to respond: the nav and workspace rows had
  // no hover rule at all, so most of the sidebar felt dead under the cursor.
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await expect(sidebar(page)).toBeVisible();

  const rows = page.locator(
    ".aui-sidebar nav button, .aui-sidebar .library-workspaces button, .aui-sidebar .aui-sidebar-toggle",
  );
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(6);

  let answered = 0;
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    // A selected row keeps its accent and a disabled one stays inert, by design.
    const inert = await row.evaluate(
      (el) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-current") === "page",
    );
    const before = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await row.hover({ force: true });
    await page.waitForTimeout(160);
    const after = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    if (inert) expect(after).toBe(before);
    else {
      expect(after, "row should light up under the pointer").not.toBe(before);
      answered += 1;
    }
    await page.mouse.move(2, 2);
    await page.waitForTimeout(60);
  }
  expect(answered).toBeGreaterThanOrEqual(4);
});

test("the collapse preference survives a reload, per application", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/");
  await page.locator(".aui-sidebar-toggle").first().click();
  await expect.poll(() => width(page), { timeout: 2_000 }).toBeLessThan(RAIL_MAX);

  await page.reload();
  await expect(sidebar(page)).toBeVisible();
  expect(await width(page)).toBeLessThan(RAIL_MAX);

  // The preference is per sidebar id, so another app is unaffected.
  await page.goto("/cad/");
  await expect(sidebar(page)).toBeVisible();
  expect(await width(page)).toBeGreaterThan(EXPANDED_MIN);
});
