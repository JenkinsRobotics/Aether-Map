import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
test("CAD harness has linked layout, wiring, reports and persistent authoring", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/cad/index.html?demo=harness");
  await expect(
    page.getByRole("group", { name: "System layout drawing" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("layout.png") });
  await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await page.screenshot({ path: info.outputPath("layout-overview.png") });
  await page.getByRole("tab", { name: "Harness", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Wire harness drawing" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("wire-overview.png") });
  await page
    .getByRole("button", { name: "Select Injector 1", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Connector name", exact: true })
    .fill("Injector A");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Select layout Injector A", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Select layout Injector A", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Harness", exact: true }).click();
  await page.getByRole("button", { name: "Wire", exact: true }).click();
  await page
    .getByRole("button", { name: "Injector A pin 1 BAT +", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Injector 2 pin 1 BAT +", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("17 wires");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("16 wires");
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("grid", { name: "Connection table" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Parts", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Parts table" })).toBeVisible();
  await page.getByRole("button", { name: "Add part", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Parts table" })).toContainText(
    "New Connector",
  );
  await page.getByRole("tab", { name: "Harness", exact: true }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Injector A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete selection", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Select Injector A", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select Injector 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Select Injector A", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("physical edits, wire routing, revisions and portable exports survive reopening", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/cad/index.html?demo=harness");
  await expect(page.locator("[data-icon-missing]")).toHaveCount(0);
  await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await page
    .getByRole("button", { name: "Select branch Left trunk", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Bundle length", exact: true })
    .fill("900");
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "signal-inj1" });
  await expect(row).toContainText("1550 mm");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Bundle", exact: true }).click();
  await page
    .getByRole("button", { name: "Select layout Injector 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select layout Bulk Head E", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("22 bundles");
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await expect(row).toContainText("500 mm");
  await page.getByRole("tab", { name: "Harness", exact: true }).click();
  await page
    .getByRole("button", { name: "Select wire signal-inj1", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const handle = page.getByRole("button", {
    name: "Routing point 1",
    exact: true,
  });
  const before = await handle.getAttribute("cx"),
    bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 25, bounds!.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute("cx", before!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(handle).toHaveAttribute("cx", before!);
  await page.getByRole("button", { name: "Revisions", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Revision name" })
    .fill("Routing review");
  await page
    .getByRole("button", { name: "Create revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Injector 1", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Connector name" }).fill("Temporary");
  await page
    .getByRole("button", { name: "Restore Routing review", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select Injector 1", exact: true }),
  ).toBeVisible();
  const save = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save file", exact: true }).click();
  const document = await save;
  const path = info.outputPath(document.suggestedFilename());
  await document.saveAs(path);
  await page
    .getByRole("textbox", { name: "Connector name" })
    .fill("Changed after export");
  await page.getByLabel("Open harness file").setInputFiles(path);
  await expect(
    page.getByRole("button", { name: "Select Injector 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Harness settings", exact: true })
    .click();
  for (const name of [
    "Export drawing SVG",
    "Export connections CSV",
    "Export BOM CSV",
  ]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const result = await event;
    await result.saveAs(info.outputPath(result.suggestedFilename()));
    expect(await result.failure()).toBeNull();
  }
  expect(errors).toEqual([]);
});

test("groups, mating and on-canvas tables are editable with shared controls", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  await page.goto("/cad/index.html?demo=harness");
  await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await page.getByRole("button", { name: "Groups", exact: true }).click();
  await page.getByRole("checkbox", { name: "Injector 1", exact: true }).check();
  await page.getByRole("checkbox", { name: "Coil 1", exact: true }).check();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Group move X", exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Move group", exact: true }).click();
  await page.getByRole("checkbox", { name: "Lock group", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Move group", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Lock group", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await page
    .getByRole("button", { name: "Select layout Injector 1", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Mating connector" })
    .selectOption("inj2");
  await page.getByRole("tab", { name: "Harness", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Wiring table in harness", exact: true })
    .check();
  await expect(
    page
      .getByRole("group", { name: "Wire harness drawing" })
      .locator(".aui-harness-table"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Split view", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "System layout drawing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await page.screenshot({ path: info.outputPath("linked-split-view.png") });
  await page.reload();
  await page
    .getByRole("button", { name: "Select layout Injector 1", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Mating connector" }),
  ).toHaveValue("inj2");
});

test("CAD start and shared showcase launch the harness workspace", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  await page.goto("/cad/");
  await page
    .getByRole("button", { name: "Harness Open harness demo", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "System layout drawing" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/admin/apps", {
        headers: { Origin: baseURL! },
        data: { id: "ui", enabled: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/ui/index.html");
  await page.getByRole("tab", { name: "Widgets", exact: true }).click();
  await page
    .getByRole("heading", { name: "Electronics + instruments", exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("link", { name: "Open Aether CAD harness demo", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Harness widget specimens")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("shared-harness-widgets.png"),
  });
  await page
    .getByRole("link", { name: "Open Aether CAD harness demo", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "System layout drawing" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Appearance System", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Appearance Light", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Appearance Dark", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: info.outputPath("harness-dark-shell.png") });
});
