import { expect, test, type Page } from "@playwright/test";
import { clickRibbon, openOutput, openPanel, runCommand, saveShow, signIn, switchWorkspace } from "./helpers";

/** Anything the page throws, so a "works on my machine" pass cannot hide one. */
function watchForFailures(page: Page, label: string) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`${label} threw: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label} logged: ${message.text()}`);
  });
  return failures;
}

const canvas = (page: Page) => page.locator(".map-canvas-host").first();

test("a show built from the ready-made library projects, crossfades and survives a reload", async ({ page, baseURL }) => {
  const failures = watchForFailures(page, "editor");
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();

  // A show opens empty; the library is what makes the first five minutes work.
  await openPanel(page, "Layers");
  await runCommand(page, "Layer controls", "Add a ready-made scene");
  const picker = page.getByRole("dialog", { name: "Ready-made scenes" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: /Haunted fog/ }).click();
  await expect(picker).toBeHidden();

  const scenes = page.getByRole("tree", { name: "Layers", exact: true });
  await expect(scenes.getByRole("treeitem", { name: "Haunted fog" })).toBeVisible();
  // It arrives finished: a full-bleed surface already carrying its effect.
  await openPanel(page, "Layers");
  // Scoped to a layer row: a ready-made scene and its surface can share a word,
  // and both are in this one tree now.
  await expect(page.getByRole("tree", { name: "Layers", exact: true })
    .locator('[role=treeitem][aria-level="2"]').filter({ hasText: "Fog" }).first()).toBeVisible();
  await switchWorkspace(page, "Visualization");
  await expect(canvas(page).locator(".map-shader").first()).toBeVisible();

  // A second scene gives the crossfade something to fade to.
  await openPanel(page, "Layers");
  await runCommand(page, "Layer controls", "Add a ready-made scene");
  await page.getByRole("dialog", { name: "Ready-made scenes" }).getByRole("button", { name: /Winter drift/ }).click();
  await expect(scenes.getByRole("treeitem", { name: "Winter drift" })).toBeVisible();

  // The crossfader is an instrument, not a property of a scene, so it lives in
  // the Program panel rather than under the tree that lists the scenes.
  await openPanel(page, "Program");
  const fadeTo = page.getByRole("combobox", { name: "Scene to fade toward" });
  await expect(fadeTo).toBeVisible();
  await fadeTo.selectOption({ label: "Fade to Haunted fog" });
  const fader = page.getByRole("slider", { name: "Crossfade between scenes" });
  await expect(fader).toBeVisible();
  const output = await openOutput(page);

  // Program output blends the scenes. Each mapping artboard continues to show
  // only its own layers, so moving one cannot leave a ghost on its old scene.
  await fader.fill("50");
  await expect(output.locator(".map-mix-layer")).toHaveCount(2);
  await expect(canvas(page).locator(".map-artboard")).toHaveCount(3);
  for (const artboard of await canvas(page).locator(".map-artboard").all()) {
    await expect(artboard.locator(".map-mix-layer")).toHaveCount(1);
  }
  // At either end only one is drawn — a layer at zero is dropped, not hidden.
  await fader.fill("0");
  await expect(output.locator(".map-mix-layer")).toHaveCount(1);
  await fader.fill("100");
  await expect(output.locator(".map-mix-layer")).toHaveCount(1);
  await fader.fill("35");

  const id = await saveShow(page, "Pipeline crossfade");
  await page.goto(`/map/index.html?document=${id}`);
  await expect(canvas(page)).toBeVisible();
  await switchWorkspace(page, "Visualization");
  await openPanel(page, "Program");
  // The mix is document state, so it comes back exactly where it was left.
  await openPanel(page, "Layers");
  await expect(page.getByRole("slider", { name: "Crossfade between scenes" })).toHaveValue("35");
  await expect(output.locator(".map-mix-layer")).toHaveCount(2);
  expect(failures).toEqual([]);
});

test("editing during playback with an output open never breaks either window", async ({ page, baseURL }) => {
  // The reported crash: adjust assets while the show plays and an output window
  // is live. Every edit used to rebuild the channel and both animation clocks.
  const editorFailures = watchForFailures(page, "editor");
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await openPanel(page, "Layers");
  await runCommand(page, "Layer controls", "Add a ready-made scene");
  await page.getByRole("dialog", { name: "Ready-made scenes" }).getByRole("button", { name: /Festive lights/ }).click();
  await saveShow(page, "Pipeline stability");

  const output = await openOutput(page);
  const outputFailures = watchForFailures(output, "output");
  await expect(output.locator(".map-output-raster")).toBeVisible();

  await clickRibbon(page, "Play");
  const box = (await canvas(page).boundingBox())!;

  // Drag a surface across the canvas while it plays: one edit per pointer move,
  // which is what used to tear down a BroadcastChannel sixty times a second.
  for (let pass = 0; pass < 3; pass += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 0; step < 24; step += 1) {
      await page.mouse.move(box.x + box.width / 2 + step * 4, box.y + box.height / 2 + step * 2);
    }
    await page.mouse.up();
  }

  // Both windows are still alive and still rendering after all of that.
  await expect(canvas(page)).toBeVisible();
  await expect(output.locator(".map-output-raster")).toBeVisible();
  // And the output is still linked, not silently orphaned by a channel rebuild.
  await expect(output.locator(".map-output")).toHaveAttribute("data-link", "live");
  expect(editorFailures).toEqual([]);
  expect(outputFailures).toEqual([]);
  await output.close();
});

test("repeated shape drags and property edits keep the mapping workspace mounted", async ({ page, baseURL }) => {
  const failures = watchForFailures(page, "editor");
  page.on("crash", () => failures.push("editor renderer crashed"));
  await signIn(page, baseURL!);
  await page.addInitScript(() => {
    const state = { recoveryWrites: 0, historyWrites: 0 };
    Object.defineProperty(window, "__mapStability", { value: state });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("aether.recovery.v1:map:")) state.recoveryWrites += 1;
      return write.call(this, key, value);
    };
    const replace = history.replaceState.bind(history);
    history.replaceState = function (data, unused, url) {
      state.historyWrites += 1;
      // A deliberately tighter version of Safari's History API limiter. The
      // workspace may identify its draft and then its saved document; content
      // edits must never spend more History API calls after that.
      if (state.historyWrites > 3) throw new DOMException("History API rate limit", "SecurityError");
      return replace(data, unused, url);
    };
  });
  await page.goto("/map/index.html?new=show");
  const raster = (await page.locator(".map-artboard.is-active").boundingBox())!;
  const draw = async (tool: "Rectangle" | "Ellipse" | "Polygon", offset: number) => {
    await clickRibbon(page, tool);
    await page.mouse.move(raster.x + raster.width * offset, raster.y + raster.height * offset);
    await page.mouse.down();
    await page.mouse.move(raster.x + raster.width * (offset + .14), raster.y + raster.height * (offset + .12), { steps: 8 });
    await page.mouse.up();
  };
  await draw("Rectangle", .18);
  await draw("Ellipse", .38);
  await draw("Polygon", .58);
  await expect(page.locator(".map-outline")).toHaveCount(3);
  await expect(page.locator(".map-save-state")).toHaveText("Saved");

  // A drag can carry many raw samples. Recovery must serialize the final
  // gesture, rather than synchronously rewriting the whole show for each one.
  const writesBefore = await page.evaluate(() => (window as unknown as { __mapStability: { recoveryWrites: number } }).__mapStability.recoveryWrites);
  const first = (await page.locator(".map-outline").first().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 80, first.y + first.height / 2 + 30, { steps: 60 });
  await page.mouse.up();
  const writesAfter = await page.evaluate(() => (window as unknown as { __mapStability: { recoveryWrites: number } }).__mapStability.recoveryWrites);
  expect(writesAfter - writesBefore).toBeLessThanOrEqual(2);

  for (let pass = 0; pass < 12; pass += 1) {
    const outlines = page.locator(".map-outline");
    const target = outlines.nth(pass % 3);
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + (pass % 2 ? -9 : 11), box.y + box.height / 2 + 7, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".map-stage")).toBeVisible();
  }

  const tree = page.getByRole("tree", { name: "Layers", exact: true });
  await tree.getByRole("treeitem", { name: /Polygon 3/ }).click();
  const sides = page.getByRole("textbox", { name: "Polygon sides" });
  for (const count of [5, 8, 3, 12, 6]) {
    await sides.fill(String(count));
    await sides.press("Enter");
    await expect(page.locator(".map-mask-outline").last()).toHaveAttribute("points", new RegExp(`^(?:[^ ]+ ){${count - 1}}[^ ]+$`));
  }
  await expect(page.locator("#root")).not.toBeEmpty();
  const historyWrites = await page.evaluate(() => (window as unknown as {
    __mapStability: { historyWrites: number };
  }).__mapStability.historyWrites);
  expect(historyWrites).toBeLessThanOrEqual(2);
  expect(failures).toEqual([]);
});

test("two outputs each hold their own scene and region", async ({ page, baseURL }) => {
  const failures = watchForFailures(page, "editor");
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await expect(canvas(page)).toBeVisible();
  await openPanel(page, "Layers");
  await runCommand(page, "Layer controls", "Add a ready-made scene");
  await page.getByRole("dialog", { name: "Ready-made scenes" }).getByRole("button", { name: /Blood drip/ }).click();

  await openPanel(page, "Outputs");
  const outputs = page.getByRole("tree", { name: "Outputs", exact: true });
  await expect(outputs.getByRole("treeitem").first()).toBeVisible();
  await runCommand(page, "Output controls", "New output");
  await expect(outputs.getByRole("treeitem", { name: /Output 2/ })).toBeVisible();

  // An output is one row. Its device, scene and region are properties, not
  // children: rows that cannot be selected, opened, renamed or deleted would
  // only imply a hierarchy that is not there.
  await expect(outputs.getByRole("treeitem")).toHaveCount(2);
  await expect(outputs.getByRole("button", { name: /^(Expand|Collapse)/ })).toHaveCount(0);

  // Each output names the scene it shows; that is what multi-device means.
  await outputs.getByRole("treeitem", { name: /Output 2/ }).first().click();
  // An output's device and scene live in the Output panel.
  await openPanel(page, "Output");
  await expect(page.getByRole("radiogroup", { name: "Output device type" })).toBeVisible();
  const scene = page.getByRole("combobox", { name: "Scene shown on this output" });
  await scene.selectOption({ label: "Blood drip" });
  await expect(scene).not.toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Crop width" })).toBeVisible();

  const id = await saveShow(page, "Pipeline outputs");
  await page.goto(`/map/index.html?document=${id}`);
  await openPanel(page, "Outputs");
  await expect(page.getByRole("tree", { name: "Outputs", exact: true })
    .getByRole("treeitem", { name: /Output 2/ })).toBeVisible();
  expect(failures).toEqual([]);
});
