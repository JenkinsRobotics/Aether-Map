import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { signIn } from "./helpers";

/**
 * A projector out of the box: no network, no host, no name. The real player
 * handler and the real wizard, with only the radio faked — there is no
 * wireless card in CI, and none in a laptop running the suite either.
 */
async function unconfiguredPlayer() {
  const root = await mkdtemp(join(tmpdir(), "aether-setup-"));
  const showDir = join(root, "show");
  await mkdir(showDir, { recursive: true });
  const configFile = join(root, "config.json");
  // Exactly what the downloadable installer writes on a Pi that has never
  // been on a network: an identity and somewhere to put a show, nothing else.
  await writeFile(configFile, JSON.stringify({
    server_url: "", device_id: "pi-e2e", name: "",
    show_dir: showDir, port: 0, setup_complete: false,
  }));
  const server = spawn(resolve("../.venv/bin/python"),
    ["-u", "e2e/serve-player.py", configFile, "--fake-network"],
    { stdio: ["ignore", "pipe", "pipe"] });
  const port = await new Promise<number>((done, fail) => {
    const timer = setTimeout(() => fail(new Error("player did not start")), 10_000);
    server.once("error", fail);
    server.stdout.once("data", (data) => { clearTimeout(timer); done(Number(String(data).trim())); });
  });
  return { port, configFile, stop: () => server.kill() };
}

test("a projector out of the box is set up from a phone, in order", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const player = await unconfiguredPlayer();
  try {
    // This is the phone. It joins the projector's own network and opens the
    // address the projector is showing on the wall.
    await page.goto(`http://127.0.0.1:${player.port}/setup`);

    // 1. Wi-Fi. The networks come from a real scan through the player.
    await expect(page.getByText("Choose the network this projector should use.")).toBeVisible();
    await expect(page.locator("#ssid option")).toHaveCount(2);
    await page.selectOption("#ssid", "Barn");
    await page.fill("#psk", "wrong");
    await page.click("#go");
    // A refused passphrase says so rather than pretending to advance.
    await expect(page.locator(".err")).toContainText(/Secrets|not provided/);

    await page.fill("#psk", "haybales");
    await page.click("#go");

    // 2. The host. Typed the way someone types on a phone, with no scheme.
    await expect(page.getByText("Where Aether Studio is running on your network.")).toBeVisible();
    await page.fill("#url", "studio.local:8780");
    await page.click("#go");

    // 3. The name this projector is known by in Aether Map.
    await expect(page.getByText("What this projector is called in Aether Map.")).toBeVisible();
    await page.fill("#nm", "Front of house");
    await page.click("#go");

    // 4. What the device may do on its own.
    await expect(page.getByText("What this device is allowed to do on its own.")).toBeVisible();
    await page.uncheck("#play_audio");
    await page.click("#go");

    await expect(page.getByRole("heading", { name: /Almost there|ready/ })).toBeVisible();

    // The device wrote all of it down, and will not ask again.
    const config = JSON.parse(await readFile(player.configFile, "utf8"));
    expect(config.server_url).toBe("http://studio.local:8780");
    expect(config.name).toBe("Front of house");
    expect(config.setup_complete).toBe(true);
    expect(config.permissions).toEqual({
      keep_display_awake: true, play_audio: false, allow_updates: true,
    });
  } finally {
    player.stop();
  }
});

test("the projector screen says what to join while it waits", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  const player = await unconfiguredPlayer();
  try {
    // The kiosk view: no keyboard, so it can only tell you where to go.
    await page.goto(`http://127.0.0.1:${player.port}/`);
    await expect(page.getByRole("heading", { name: "Set up this projector" })).toBeVisible();
    await expect(page.locator("#code")).toHaveText("Aether Setup");
    await expect(page.locator("#detail")).toContainText("/setup");
  } finally {
    player.stop();
  }
});
