import { expect, type Locator, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const kindBuf = Buffer.from(kind, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([kindBuf, body])));
    return Buffer.concat([length, kindBuf, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function signIn(page: Page, baseURL: string) {
  const response = await page.request.post("/api/login", {
    headers: { Origin: baseURL },
    data: { username: "e2e", password: "end-to-end-password-2026" },
  });
  expect(response.ok()).toBe(true);
}
export const ribbon = (page: Page, name: string) => page.getByRole("region", { name: "Map tools" }).getByRole("button", { name, exact: true });
/** Find commands through the visible tab controls, just as an operator would. */
export async function clickRibbon(page: Page, name: string) {
  // Historical callers create and place a visual; source creation now lives in the pool.
  if (["Text", "Shader", "Webcam", "Tracker", "Paint"].includes(name)) {
    await switchWorkspace(page, "Visualization");
    const pool = page.getByRole("region", { name:"Media Pool", exact:true });
    await pool.getByRole("tab", { name:"Generators", exact:true }).click();
    await pool.getByRole("button", { name:`New ${name.toLowerCase()}`, exact:true }).click();
    await pool.getByRole("button", { name:"Append to track", exact:true }).click();
    return;
  }
  if (name === "Add Media") {
    await switchWorkspace(page, "Visualization");
    const pool = page.getByRole("region", { name:"Media Pool", exact:true });
    await pool.getByRole("tab", { name:"Media Pool", exact:true }).click();
    await pool.getByRole("button", { name:"Import", exact:true }).click();
    return;
  }
  // Legacy specs call this for New Surface; that command now lives in the
  // Layers header menu, while the full ribbon holds the drawing shapes.
  if (name === "New Surface") {
    await page.getByRole("group", { name: "Layer controls" }).first()
      .getByRole("button", { name: "Create in Layer controls" }).click();
    await page.getByRole("menuitem", { name: "New Surface" }).click();
    return;
  }
  if (name === 'Input preview') {
    await switchWorkspace(page,'Visualization');
    await page.getByRole('button',{name,exact:true}).click(); return;
  }
  if (name === 'Output') {
    await openOutputProperties(page); return;
  }
  // The Show workspace's lists are in the sidebar: Players opens its manager.
  if (name === 'Devices') {
    await switchWorkspace(page,'Show');
    await page.getByRole('button',{name:'Manage players',exact:true}).click(); return;
  }
  if (name === 'New Output') {
    await switchWorkspace(page,'Show');
    await page.getByRole('group',{name:'Output controls'}).getByRole('button',{name:'New output',exact:true}).click(); return;
  }
  if (name === 'Play' || name === 'Pause') {
    await openTimeline(page);
    await page.getByRole('button',{name,exact:true}).click(); return;
  }
  await switchWorkspace(page,'Mapping');
  if(await page.locator('.aui-shell').getAttribute('data-layout')==='canvas') await page.locator('.aui-shell-edge--top').hover();
  const tool = ribbon(page,name);
  if (await tool.count()) await tool.click();
  else {
    const family=({Square:'Rectangle',Circle:'Ellipse',Box:'Cube'} as Record<string,string>)[name];
    await ribbon(page,`${family} variants`).click();
    await page.getByRole('menuitemradio',{name,exact:true}).click();
  }
}
/** Use the shared header switcher and verify the selected workspace. */
export async function switchWorkspace(page: Page, name: "Mapping" | "Content" | "Scene" | "Visualization" | "Sequence" | "Show") {
  // The Visualization workspace was renamed Scene (2026-10-22).
  if (name === 'Sequence' || name === 'Visualization') name = 'Scene';
  const current = page.getByRole('button', {name:`Workspace: ${name}`, exact:true});
  if (await current.count()) return;
  await page.getByRole('button', {name:/^Workspace: /}).click();
  await page.getByRole('menuitemradio', {name, exact:true}).click();
  await expect(current).toBeVisible();
}

export async function saveShow(page: Page, name: string) {
  await documentCommand(page, "Rename show");
  const dialog = page.getByRole("dialog", { name: "Save show" });
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/document=/);
  return new URL(page.url()).searchParams.get("document")!;
}
export async function openOutput(page: Page) {
  await clickRibbon(page, "Output");
  const next = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open output window" }).click();
  const output = await next;
  await expect(output).toHaveTitle("Aether Map — Output");
  return output;
}

/** A rail panel button is a toggle; open it only when it is not already open. */
export async function openPanel(page: Page, label: string) {
  // Use visible content for the compound feature panel: its state can settle
  // while a selection changes, and toggling an already visible panel closes it.
  if (label === 'Layers' || label === 'Outputs') {
    const tree = page.getByRole('tree', {name:label, exact:true});
    if (!await tree.isVisible()) await page.getByRole('button', {name:'Features and parts',exact:true}).click();
    await expect(tree).toBeVisible();
    return page.getByRole('button', {name:'Features and parts',exact:true});
  }
  // Tests can name the Map content; the suite rail has standardized titles.
  label = ({ Layers: "Features and parts", Outputs: "Features and parts", "Aether Agent": "AI advisor" } as Record<string,string>)[label] ?? label;
  const button = page.locator(`:is(.aui-rail-button,.aui-tabbed-sidebar-tab)[aria-label="${label}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  return button;
}

/**
 * An output's device is a property of the output, so its controls live in the
 * right rail keyed to whichever output is selected in the Outputs tree.
 * Returns the monitor picker.
 */
export async function openOutputProperties(page: Page) {
  await openPanel(page, "Outputs");
  await page.getByRole("tree", { name: "Outputs", exact: true }).getByRole("treeitem").first().click();
  // The Output panel is the dedicated editor; Properties also answers for the
  // selected output, so the same controls are mounted twice. Either is live —
  // scope to one so a locator is not ambiguous.
  await openPanel(page, "Output");
  return page.locator(".map-monitor").first();
}

/**
 * A collection footer keeps only "New folder" and its create command in view;
 * every other command lives behind "More <label>". Opens that menu (leaving an
 * already-open one alone) and returns it.
 */
async function openCommands(page: Page, group: string): Promise<Locator> {
  const more = page.getByRole("group", { name: group }).getByRole("button", { name: `More ${group}` });
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  return page.getByRole("menu", { name: group });
}

/** Menu items carry their shortcut in the accessible name, so match the start. */
const commandItem = (menu: Locator, name: string) =>
  menu.getByRole("menuitem", { name: new RegExp(`^${name}`) });

/**
 * A collection command wherever it lives: "New folder" and the create command
 * stay in the footer, the rest are in its menu. Ready to click or assert on;
 * leaves the menu open when it had to open one.
 */
export async function command(page: Page, group: string, name: string): Promise<Locator> {
  const button = page.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
  if (await button.count()) return button;
  return commandItem(await openCommands(page, group), name);
}

/** Run a collection command wherever it lives. */
export async function runCommand(page: Page, group: string, name: string) {
  await (await command(page, group, name)).click();
}

/**
 * Bring the Timeline into the tray. Mapping opens on Surfaces now, and a tray
 * renders only its active workspace, so timeline controls do not exist until
 * the timeline is chosen. Idempotent: the Sequence room is already on it.
 */
export async function openTimeline(page: Page) {
  await switchWorkspace(page, "Visualization");
  await openBottomDock(page, "Timeline");
}

/**
 * Link an output to a scene.
 *
 * An output renders only the scene it is bound to — it does not follow whatever
 * scene is being edited — so a test that wants the output window showing a
 * particular scene has to say which one, the same way an operator does.
 */
export async function bindOutputScene(page: Page, sceneName: string) {
  await openOutputProperties(page);
  await page.getByRole("combobox", { name: "Scene shown on this output" }).first()
    .selectOption({ label: sceneName });
}

/**
 * A document command from the header's hamburger menu. Undo, Redo, Save,
 * Import and Export act on the show rather than on a selection, so they are
 * not ribbon tools.
 */
export async function documentCommand(page: Page, name: string) {
  await page.getByRole("button", { name: "Document controls" }).first().click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).first().click();
}

/**
 * The Assets tab opens on Browse — what you can bring in. This switches to the
 * other half, the media this show already has.
 */
export async function openShowMedia(page: Page) {
  await page.getByRole("region", { name: "Media Pool", exact: true }).getByRole("tab", { name: "Media Pool", exact: true }).click();
}

/** Open the app window through the standardized settings dropdown. */
export async function openAppSettings(page: Page) {
  await page.getByRole('button', { name: 'Customize user bar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Quick controls', exact: true }).getByText('Settings', { exact: true }).click();
}

/** Open a bottom dock panel without accidentally collapsing the selected one. */
export async function openBottomDock(page: Page, name: string) {
  const tab = page.getByRole("toolbar", { name: "Map workspace dock tabs" }).getByRole("button", { name, exact: true });
  if (await tab.getAttribute("aria-pressed") !== "true") await tab.click();
}

/** Library creation and opening are separate actions in every app. */
export async function createIOProject(page: Page, template = 'ESP32 status indicator') {
  await page.locator('.io-template').filter({hasText: template}).click();
  const dialog = page.getByRole('dialog', {name: 'New circuit', exact: true});
  await dialog.getByRole('textbox', {name: 'Name', exact: true}).fill(template);
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('table', {name: 'Circuit files'}).getByRole('button', {name: `${template}.aetherio`, exact: false}).first().dblclick();
}

/** Opens a right-sidebar tab without toggling it closed if it is already open. */
export async function rightTab(page: Page, name: string) {
  const tab = page.getByRole('toolbar',{name:'Right sidebar tabs'}).getByRole('button',{name,exact:true});
  if (await tab.getAttribute('aria-pressed') !== 'true') await tab.click();
}
/** The Players manager (pairing, deploy, mirror), opened from the Players section. */
export async function players(page: Page) {
  const dialog = page.getByRole('dialog',{name:'Devices'});
  if (!await dialog.isVisible()) await page.getByRole('button',{name:'Manage players',exact:true}).click();
  return dialog;
}
