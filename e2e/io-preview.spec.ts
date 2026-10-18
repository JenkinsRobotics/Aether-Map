import { expect, test } from "@playwright/test";
import { createIOProject, openAppSettings, signIn } from "./helpers";

test("Studio launches the installed Aether IO application", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  expect(
    (
      await page.request.post("/api/admin/apps", {
        headers: { Origin: baseURL! },
        data: { id: "io", enabled: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  const launch = page.getByRole("link", {
    name: /^Aether IO .*Open application/,
  });
  await expect(launch).toBeVisible();
  const popup = page.waitForEvent("popup");
  await launch.click();
  const app = await popup;
  await expect(app).toHaveURL(/\/io\//);
  await expect(
    app.getByRole("heading", { name: "Aether IO", exact: true }),
  ).toBeVisible();
  const logo = app.locator('img[src*="/icons/io.png"]').first();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(512);
  const favicon = await app.locator('link[rel="icon"]').getAttribute("href");
  expect(favicon).toMatch(/\/icons\/io-[a-f0-9]+\.ico$/);
  expect((await app.request.get(favicon!)).ok()).toBe(true);
  await app.close();
});

test("IO exposes seven workflows and retains backend setup without claiming execution", async ({
  page,
  baseURL,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, baseURL!);
  expect(
    (
      await page.request.post("/api/admin/apps", {
        headers: { Origin: baseURL! },
        data: { id: "io", enabled: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/io/");
  await createIOProject(page);
  async function workspace(name: string) {
    await page.getByRole("button", { name: /^Workspace:/ }).click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(7);
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  }
  await workspace("Simulation");
  await expect(
    page.getByRole("button", { name: "Run analysis", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("img", { name: "Analysis results · awaiting solver" })
      .locator("polyline"),
  ).toHaveCount(0);
  const duration = page.getByRole("textbox", { name: "Duration", exact: true });
  await duration.fill("5");
  await duration.press("Enter");
  await page.screenshot({ path: info.outputPath("io-simulation.png") });
  await workspace("Manufacture");
  const width = page.getByRole("textbox", { name: "Board width", exact: true });
  await width.fill("120");
  await width.press("Enter");
  await page
    .getByRole("combobox", { name: "Copper layers", exact: true })
    .selectOption("4");
  await expect(
    page.getByRole("button", { name: "Generate Gerber + drill", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Request quote", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("io-manufacture.png") });
  await workspace("3D View");
  await page
    .getByRole("combobox", { name: "Board view", exact: true })
    .selectOption("Exploded");
  await expect(
    page.getByText("Board model not available", { exact: true }),
  ).toBeVisible();
  await workspace("Firmware");
  await page
    .getByRole("combobox", { name: "Firmware target", exact: true })
    .selectOption("Arduino UNO");
  await expect(
    page.getByRole("button", { name: "Run firmware", exact: true }),
  ).toBeDisabled();
  await page.reload();
  // A saved document has a stable URL and reloads directly into its editor.
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await workspace("Manufacture");
  await expect(width).toHaveValue("120");
  await expect(
    page.getByRole("combobox", { name: "Copper layers", exact: true }),
  ).toHaveValue("4");
  await workspace("Simulation");
  await expect(duration).toHaveValue("5");
  await workspace("Firmware");
  await expect(
    page.getByRole("combobox", { name: "Firmware target", exact: true }),
  ).toHaveValue("Arduino UNO");
  await workspace("3D View");
  await expect(
    page.getByRole("combobox", { name: "Board view", exact: true }),
  ).toHaveValue("Exploded");
  expect(errors).toEqual([]);
});

test("IO home and shared editor support local circuit editing, wiring, undo and source persistence", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  expect(
    (
      await page.request.post("/api/admin/apps", {
        headers: { Origin: baseURL! },
        data: { id: "io", enabled: true },
      })
    ).ok(),
  ).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/io/");
  await expect(
    page.getByRole("heading", { name: "Aether IO", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("io-home-dark.png") });
  await createIOProject(page);
  const shell = page.locator(".aui-shell");
  await expect(shell).toHaveAttribute("data-sidebar-variant", "tabs-top");
  await expect(page.locator(".io-part")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Select U1 Controller", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Component value", exact: true }),
  ).toHaveValue("ESP32-WROOM-32");
  await page.screenshot({ path: info.outputPath("io-schematic-dark.png") });
  await page.getByRole("button", { name: "Resistor", exact: true }).click();
  await expect(page.locator(".io-part")).toHaveCount(7);
  await page.getByRole("button", { name: "Wire", exact: true }).click();
  await page.getByRole("button", { name: "Connect R2 +", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect U1 GPIO21", exact: true })
    .click();
  await expect(page.locator(".io-wire")).toHaveCount(10);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".io-part")).toHaveCount(6);
  await expect(page.locator(".io-wire")).toHaveCount(9);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".io-part")).toHaveCount(7);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const component = page.getByRole("button", {
    name: "Select R2 Resistor",
    exact: true,
  });
  const before = await component.getAttribute("transform");
  const box = (await component.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 95, box.y + 45, { steps: 5 });
  await page.mouse.up();
  await expect(component).not.toHaveAttribute("transform", before!);
  async function workspace(name: string) {
    await page.getByRole("button", { name: /^Workspace:/ }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  }
  await workspace("PCB Layout");
  await expect(page.locator(".io-board")).toBeVisible();
  await page.screenshot({ path: info.outputPath("io-pcb.png") });
  await workspace("Wiring");
  await expect(page.getByText("HARDWARE BENCH", { exact: true })).toBeVisible();
  await workspace("Firmware");
  const code = page.getByRole("textbox", { name: "Firmware source" });
  await code.fill("// persisted source draft");
  await expect(
    page.getByRole("button", { name: "Compile", exact: true }),
  ).toBeDisabled();
  await page.reload();
  // A saved document has a stable URL and reloads directly into its editor.
  await expect(page.locator('.io-document-bar')).toBeVisible();
  await workspace("Firmware");
  await expect(code).toHaveValue("// persisted source draft");
  await page
    .getByRole("toolbar", { name: "Left sidebar tabs" })
    .getByRole("button", { name: "AI advisor", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ask Aether Agent" }),
  ).toHaveCount(1);
  await workspace("Schematic");
  await page.getByRole("button", { name: "Blink demo", exact: true }).click();
  await expect(
    page.getByText("Scripted demonstration running", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop demo", exact: true }).click();
  await page.screenshot({ path: info.outputPath("io-agent.png") });
});

test("IO stays usable in light mode, supports sidebar layouts and exposes its shared assets", async ({
  page,
  baseURL,
}, info) => {
  await signIn(page, baseURL!);
  for (const id of ["io", "ui"])
    expect(
      (
        await page.request.post("/api/admin/apps", {
          headers: { Origin: baseURL! },
          data: { id, enabled: true },
        })
      ).ok(),
    ).toBe(true);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/io/");
  await createIOProject(page, 'Blank circuit');
  await page.getByRole("button", { name: /^Sidebar design:/ }).click();
  await page
    .getByRole("menuitemradio", { name: "Bottom tabs", exact: true })
    .click();
  await expect(page.locator(".aui-shell")).toHaveAttribute(
    "data-sidebar-variant",
    "tabs-bottom",
  );
  await page
    .getByRole("toolbar", { name: "Left sidebar tabs" })
    .getByRole("button", { name: "Components", exact: true })
    .click();
  await page
    .locator(".io-library-part")
    .filter({ hasText: "Capacitor" })
    .click();
  await expect(page.locator(".io-part")).toHaveCount(1);
  await openAppSettings(page);
  const dialog = page.getByRole("dialog", { name: "Aether IO settings" });
  await dialog
    .getByRole("combobox", { name: "Workspace layout" })
    .selectOption("floating");
  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(page.locator(".aui-shell")).toHaveAttribute(
    "data-layout",
    "floating",
  );
  await expect
    .poll(() =>
      page
        .locator(".io-work-area")
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThan(300);
  await page.screenshot({ path: info.outputPath("io-light-floating.png") });
  await page.goto("/ui/index.html#tab=widgets");
  const heading = page.getByRole("heading", {
    name: "Electronics + instruments",
    exact: true,
  });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle LED highlight", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Toggle LED highlight", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("img", { name: "Illustrative logic and analog traces" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("io-shared-showcase.png") });
});
