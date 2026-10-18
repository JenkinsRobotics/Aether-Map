import { defineConfig } from "@playwright/test";

// One host per run. Two suites in the same checkout — a second agent, or a
// rerun launched over a live one — otherwise fight over a single port, and
// whoever starts second tears the first run's host down mid-test. That reads
// as ECONNREFUSED in tests that passed a second earlier.
// ponytail: derived from the pid rather than an OS-assigned free port, because
// Playwright needs the number before it launches anything.
const PORT = Number(process.env.AETHER_E2E_PORT) || 8790 + (process.pid % 1000);
// Workers re-load this file in their own processes, so hand the chosen number
// down through the environment they inherit rather than recomputing it.
process.env.AETHER_E2E_PORT = String(PORT);

/**
 * End to end against the production build, served by a throwaway Aether
 * Studio host. Uses the machine's installed Chrome rather than downloading a
 * browser, which is also what a laptop on the projector will be running.
 */
export default defineConfig({
  testDir: "e2e",
  // Artifacts go under the run's own port too. Playwright empties its
  // output directory as a run starts, so a second suite in this checkout
  // would delete the traces a live run is still writing — which surfaces
  // as ENOENT on .playwright-artifacts, not as a test result.
  outputDir: `test-results/${PORT}`,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // exec: the shell hands the process over, so Playwright's shutdown signal
    // reaches Python and the port is released between runs.
    command: `exec ../AetherStudio/.venv/bin/python e2e/host.py`,
    url: `http://127.0.0.1:${PORT}/api/map/ping`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { AETHER_E2E_PORT: String(PORT) },
  },
});
