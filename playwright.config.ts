import { defineConfig, devices } from "@playwright/test";

// Set PLAYWRIGHT_PORT to run several suites at once, for example from separate worktrees.
const port = Number(process.env.PLAYWRIGHT_PORT || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PLAYWRIGHT_PORT must be a port number from 1 to 65535, got "${process.env.PLAYWRIGHT_PORT}".`);
}
const baseURL = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});