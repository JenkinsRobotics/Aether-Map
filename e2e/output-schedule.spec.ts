import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, openOutput, openOutputProperties, openPanel, saveShow, signIn, switchWorkspace } from "./helpers";

/** A window around the browser's own clock, so no time needs faking. */
function windowAround(fromHoursFromNow: number, toHoursFromNow: number) {
  const at = (offset: number) => {
    const date = new Date(Date.now() + offset * 3600_000);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  return { from: at(fromHoursFromNow), to: at(toHoursFromNow) };
}

const showtime = (page: Page) => page.getByRole("radiogroup", { name: "Showtime" });

async function beEdgeDevice(page: Page) {
  await openOutputProperties(page);
  await page.getByRole("radio", { name: "Edge device" }).click();
}

async function setHours(page: Page, from: string, to: string) {
  await page.getByRole("radio", { name: "On a schedule" }).click();
  await page.getByRole("textbox", { name: "Starts" }).fill(from);
  await page.getByRole("textbox", { name: "Ends" }).fill(to);
}

/**
 * A showtime belongs to the one output that runs with nobody there. A monitor
 * or a Cast window lives only as long as the machine driving it is awake, and
 * whoever opened it is present to start the show.
 */
test("only an edge device is offered a showtime", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await openOutputProperties(page);

  await expect(page.getByRole("radiogroup", { name: "Output device type" })).toBeVisible();
  await expect(showtime(page)).toBeHidden();

  await page.getByRole("radio", { name: "Wireless" }).click();
  await expect(showtime(page)).toBeHidden();

  await page.getByRole("radio", { name: "Edge device" }).click();
  await expect(showtime(page)).toBeVisible();
});

test("taking a device off a schedule and off the projector leaves no hidden rule", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await beEdgeDevice(page);
  await setHours(page, "18:00", "23:00");

  await openPanel(page, "Outputs");
  const row = page.getByRole("tree", { name: "Outputs", exact: true }).getByRole("treeitem").first();
  await expect(row).toHaveAccessibleName(/Daily 18:00–23:00/);

  // Back to a monitor: the schedule goes with the device it belonged to,
  // rather than staying behind to black out a window for invisible reasons.
  await page.getByRole("radio", { name: "Monitor" }).click();
  await expect(showtime(page)).toBeHidden();
  await expect(row).not.toHaveAccessibleName(/18:00/);

  await page.getByRole("radio", { name: "Edge device" }).click();
  await expect(page.getByRole("radio", { name: "Always on" })).toBeChecked();
});

test("a scheduled device projects inside its hours and is dark outside them", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await clickRibbon(page, "New Surface");
  await expect(page.locator(".map-artboard.is-active .map-surface")).toHaveCount(1);

  // A surface is geometry; put content on it before checking projection.
  await switchWorkspace(page, "Visualization");
  await clickRibbon(page, "Shader");

  // Open the window first, while this is still an ordinary monitor output —
  // the way an operator previews a projector before handing it to a Pi. The
  // window belongs to the output, so it stays put when the device changes,
  // and what it draws from here on is what the Pi will draw.
  const output = await openOutput(page);
  await expect(output.locator(".map-surface")).toHaveCount(1);

  await openOutputProperties(page);
  await page.getByRole("radio", { name: "Edge device" }).click();
  const later = windowAround(2, 3);
  await setHours(page, later.from, later.to);
  await expect(output.locator(".map-surface")).toHaveCount(0);

  // Move the hours over the present and the picture comes up.
  const now = windowAround(-1, 1);
  await page.getByRole("textbox", { name: "Starts" }).fill(now.from);
  await page.getByRole("textbox", { name: "Ends" }).fill(now.to);
  await expect(output.locator(".map-surface")).toHaveCount(1);
  await output.close();
});

test("a showtime is saved with the show and reads back on its row", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await beEdgeDevice(page);
  await setHours(page, "18:00", "23:00");

  // Weekends only: the day toggles are the "which nights" answer.
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
    await page.getByRole("button", { name: day, exact: true }).click();
  }
  await expect(page.getByText("Sun Sat 18:00–23:00").filter({ visible: true })).toBeVisible();

  const id = await saveShow(page, "Scheduled show");
  await page.goto(`/map/index.html?document=${id}`);
  await openPanel(page, "Outputs");
  await expect(page.getByRole("tree", { name: "Outputs", exact: true })
    .getByRole("treeitem").first()).toHaveAccessibleName(/Sun Sat 18:00–23:00/);
});

test("a showtime that runs through midnight says so", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await beEdgeDevice(page);
  await setHours(page, "22:00", "02:00");
  await expect(page.getByText(/Daily 22:00–02:00 — runs through midnight/).filter({ visible: true })).toBeVisible();
});
