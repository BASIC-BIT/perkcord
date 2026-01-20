import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..", "..");

const parsedPort = Number(process.env.PLAYWRIGHT_TEST_PORT);
const port = Number.isFinite(parsedPort) ? parsedPort : 3001;
const baseURL = `http://127.0.0.1:${port}`;
const reuseExistingNextServer = process.env.PLAYWRIGHT_REUSE_SERVER === "true";
const reuseExistingConvexServer = process.env.PLAYWRIGHT_REUSE_CONVEX !== "false";

const readEnvValue = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) {
    return {};
  }
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const entries: Record<string, string> = {};
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && value && !(key in entries)) {
      entries[key] = value;
    }
  }
  return entries;
};

const webEnv = readEnvFile(path.join(configDir, ".env.local"));
const convexEnv = readEnvFile(path.join(repoRoot, "convex", ".env.local"));

const readEnv = (key: string, fallback?: string) =>
  readEnvValue(process.env[key]) ??
  readEnvValue(webEnv[key]) ??
  readEnvValue(convexEnv[key]) ??
  fallback;

const convexUrl =
  readEnv("PLAYWRIGHT_CONVEX_URL") ?? readEnv("CONVEX_URL", "http://127.0.0.1:3210")!;
const convexHttpUrl =
  readEnv("PLAYWRIGHT_CONVEX_HTTP_URL") ??
  readEnv("PERKCORD_CONVEX_HTTP_URL", "http://127.0.0.1:3211")!;
const convexPort = Number(new URL(convexUrl).port) || 3210;
const restApiKey = readEnv("PERKCORD_REST_API_KEY", "playwright-rest-key")!;
const sessionSecret = readEnv("PERKCORD_SESSION_SECRET", "playwright-smoke-secret")!;
const convexDeployment = readEnv("CONVEX_DEPLOYMENT");
const convexTmpDir = path.resolve(repoRoot, "convex", ".convex", "tmp");
mkdirSync(convexTmpDir, { recursive: true });

process.env.CONVEX_URL = convexUrl;
process.env.PERKCORD_CONVEX_HTTP_URL = convexHttpUrl;
process.env.PERKCORD_REST_API_KEY = restApiKey;
process.env.PERKCORD_SESSION_SECRET = sessionSecret;
if (convexDeployment) {
  process.env.CONVEX_DEPLOYMENT = convexDeployment;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "en-US",
    timezoneId: "UTC",
  },
  webServer: [
    {
      command: "node scripts/playwright-convex-dev.mjs",
      cwd: configDir,
      reuseExistingServer: reuseExistingConvexServer,
      port: convexPort,
      env: {
        ...process.env,
        CONVEX_URL: convexUrl,
        CONVEX_DEPLOYMENT: convexDeployment ?? process.env.CONVEX_DEPLOYMENT,
        CONVEX_TMPDIR: convexTmpDir,
        PERKCORD_REST_API_KEY: restApiKey,
      },
    },
    {
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
      url: baseURL,
      cwd: configDir,
      reuseExistingServer: reuseExistingNextServer,
      env: {
        ...process.env,
        CONVEX_URL: convexUrl,
        PERKCORD_CONVEX_HTTP_URL: convexHttpUrl,
        PERKCORD_REST_API_KEY: restApiKey,
        PERKCORD_SESSION_SECRET: sessionSecret,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
