import { expect, test } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { emptyShow, newSurface } from "../src/document";
import { contentClip } from "../src/surface-assets";
import { DEFAULT_TRACKER } from "../src/features/types";
import { command, openPanel, signIn, solidPng, switchWorkspace } from "./helpers";

const run = promisify(execFile);

test("pair, deploy, update, replace and stop the real local player", async ({ page, context, baseURL }, info) => {
  await signIn(page, baseURL!);
  const post = async (path: string, data: object) => {
    const response = await page.request.post(path, { headers: { Origin: baseURL! }, data });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return response.json();
  };
  const show = emptyShow();
  show.output = { width: 320, height: 180 };
  const surface = newSurface(show.output, 0);
  const mediaName = `player-${Date.now()}.png`;
  const upload = await page.request.put(`/api/map/media/${mediaName}`, {
    headers: { Origin: baseURL!, "Content-Type": "image/png" }, data: solidPng(320, 180, [200, 80, 20]),
  });
  expect(upload.ok()).toBe(true);
  show.media = [{ id: "asset", file: mediaName, name: "Wall", kind: "image", width: 320, height: 180, bytes: 500 }];
  surface.source = { mediaId: "asset", rect: [0, 0, 320, 180] };
  surface.clips = [contentClip(surface.source, show.media, 0, "clip")];
  surface.source = { mediaId: null, rect: surface.source.rect }; surface.sequence = true;
  show.scenes[0].surfaces = [surface];
  show.scenes[0].setupBackground = { mediaId: "asset", visible: true, opacity: 0.5 };
  const bytes = () => Buffer.from(JSON.stringify(show)).toString("base64");
  const first = await post("/api/library/create", { app: "map", kind: "file", name: "Player workflow.aethermap", scope: "personal", data_base64: bytes() });
  await page.goto(`/map/index.html?document=${first.id}`);
  await switchWorkspace(page, "Visualization");
  await expect(page.locator(".map-surface img")).toBeVisible();

  const deviceID = `pi-functional-${Date.now()}`;
  const pairingSecret = `test-device-private-secret-${Date.now()}-bootstrap`;
  const announcement = await post("/api/map/devices/announce", { device_id: deviceID, name: "Test projector", pairing_secret: pairingSecret });
  // Pairing and deploying players is a command of the Outputs collection; which
  // player an output uses is a property of that output.
  await openPanel(page, "Outputs");
  await (await command(page, "Output controls", "Devices")).click();
  await page.getByRole("button", { name: "Pair a device" }).click();
  await page.getByPlaceholder("000000").fill(announcement.code);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Deploy this show" })).toBeVisible();
  const denied = await page.request.post("/api/map/devices/announce", { data: { device_id: deviceID } });
  expect(denied.status()).toBe(403);
  const paired = await post("/api/map/devices/announce", { device_id: deviceID, name: "Test projector", pairing_secret: pairingSecret });

  const directory = await mkdtemp(join(tmpdir(), "aether-player-functional-"));
  const showDir = join(directory, "show");
  await mkdir(showDir);
  const configFile = join(directory, "config.json");
  await writeFile(configFile, JSON.stringify({ server_url: baseURL, device_id: deviceID,
    token: paired.token, pairing_secret: pairingSecret, show_dir: showDir, port: 0 }), { mode: 0o600 });
  const python = resolve("../.venv/bin/python");
  const player = resolve("../aether-player/aether_player.py");
  const server = spawn(python, ["-u", "e2e/serve-player.py", configFile], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    const port = await new Promise<number>((resolvePort, reject) => {
      const timeout = setTimeout(() => reject(new Error("Player server did not start")), 10_000);
      server.once("error", reject);
      server.stdout.once("data", (data) => { clearTimeout(timeout); resolvePort(Number(String(data).trim())); });
    });
    const screen = await context.newPage();
    await screen.goto(`http://127.0.0.1:${port}/`);
    await expect(screen.getByText("Paired. Deploy a show from Aether Map.")).toBeVisible();
    await page.getByRole("button", { name: "Deploy this show" }).click();
    const pull = () => run(python, [player, "--config", configFile, "--once"]);
    await pull();
    await expect(screen).toHaveURL(/index.html\?output=1/);
    await expect(screen.locator(".map-surface img")).toBeVisible();
    await expect(screen.locator(".map-setup-background, .map-overlay, .map-doc-brand")).toHaveCount(0);
    expect(await screen.locator(".map-surface img").getAttribute("src")).toBe(`media/${mediaName}`);
    expect((await readFile(join(showDir, "media", mediaName))).length).toBeGreaterThan(0);
    const before = await screen.locator(".map-surface img").evaluate((el) => (el as HTMLElement).style.transform);
    // Opening legacy fixtures upgrades their timelines and autosaves a revision.
    await expect(page.locator(".map-save-state")).toHaveText("Saved");
    const current = await post("/api/library/read", { app: "map", id: first.id });
    show.scenes[0].surfaces[0].corners[0] = [80, 45];
    await post("/api/library/save", { app: "map", id: first.id, expected_revision: current.revision, data_base64: bytes() });
    await pull();
    await expect.poll(() => screen.locator(".map-surface img").evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);

    // Generated effects and recorded hands travel with a show and render locally.
    const shader = newSurface(show.output, 1);
    shader.source = { mediaId: null, rect: [0, 0, 320, 180], shader: {
      preset: "mesh-gradient", colors: ["#ff5599", "#2255ff", "#ddddff"], parameters: { speed: 1, distortion: .8, swirl: .1 },
    } };
    const tracker = newSurface(show.output, 2);
    tracker.source = { mediaId: null, rect: [0, 0, 1280, 720], tracker: {
      ...DEFAULT_TRACKER, recording: { durationS: 1, loop: true, frames: [{ timeS: 0, hands: [{ side: "Left", points: Array.from({ length: 21 }, (_, i) => [.25 + (i % 5) * .07, .25 + Math.floor(i / 5) * .08, 0]) }] }] },
    } };
    shader.clips = [contentClip(shader.source, [], 0, "shader-clip")];
    shader.source = { mediaId: null, rect: shader.source.rect }; shader.sequence = true;
    show.scenes[0].surfaces.push(shader, tracker);
    // Different document at the same revision as the first must still deploy.
    const replacement = await post("/api/library/create", { app: "map", kind: "file", name: "Replacement.aethermap", scope: "personal", data_base64: bytes() });
    await post("/api/library/save", { app: "map", id: replacement.id, expected_revision: replacement.revision, data_base64: bytes() });
    await post("/api/map/devices/assign", { device_id: deviceID, document: replacement.id });
    await pull();
    expect(JSON.parse(await readFile(configFile, "utf8")).document).toBe(replacement.id);
    await page.close();
    // The screen may reach only its local player, even while the test host remains up.
    await screen.route("**/*", (route) => new URL(route.request().url()).port === String(port) ? route.continue() : route.abort());
    await screen.reload();
    await expect(screen.locator(".map-surface img")).toBeVisible();
    await expect(screen.locator(".map-shader canvas")).toBeVisible();
    await expect(screen.locator(".map-tracker")).toHaveAttribute("data-hands", "1");
    const generatedBefore = await screen.locator(".map-shader canvas").screenshot();
    await screen.waitForTimeout(200);
    expect((await screen.locator(".map-shader canvas").screenshot()).equals(generatedBefore)).toBe(false);
    await screen.screenshot({ path: info.outputPath("local-player-projection.png") });

    // Use the authenticated request context after closing the editor.
    const stop = await context.request.post(`${baseURL}/api/map/devices/assign`, {
      headers: { Origin: baseURL! }, data: { device_id: deviceID, document: null },
    });
    expect(stop.ok()).toBe(true);
    await pull();
    await expect(screen.locator(".map-surface")).toHaveCount(0);
    await screen.screenshot({ path: info.outputPath("local-player-stopped.png") });
  } finally {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
});
