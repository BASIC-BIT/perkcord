import { defineConfig, devices } from "@playwright/test";

const parsedPort = Number(process.env.PLAYWRIGHT_TEST_PORT);
const port = Number.isFinite(parsedPort) ? parsedPort : 3001;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      PERKCORD_SESSION_SECRET: "playwright-smoke-secret",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
