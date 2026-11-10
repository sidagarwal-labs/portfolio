import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/models",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4176/",
    launchOptions: { args: ["--enable-unsafe-webgpu"] }
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176/",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
