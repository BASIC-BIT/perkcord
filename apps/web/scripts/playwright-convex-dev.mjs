import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const testDiscordGuildId =
  process.env.PLAYWRIGHT_CONVEX_TEST_GUILD_ID ?? "123456789012345678";

const normalizeUrl = (value) => value.replace(/\/$/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBackendRunning = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`${normalizeUrl(convexUrl)}/instance_name`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const getBackendStatus = async () => {
  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const apiModule = await import(
      pathToFileURL(path.join(repoRoot, "convex", "_generated", "api.js")).href,
    );
    const client = new ConvexHttpClient(convexUrl, { logger: false });
    await client.query(apiModule.api.entitlements.listPublicTiersByDiscordGuild, {
      discordGuildId: testDiscordGuildId,
    });
    return "ready";
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Could not find public function")) {
        return "missing-functions";
      }
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED")
      ) {
        return "unreachable";
      }
    }
    throw error;
  }
};

const stopExistingBackend = () => {
  try {
    if (process.platform === "win32") {
      execSync(
        "powershell -NoProfile -Command \"Get-NetTCPConnection -LocalPort 3210,3211 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }\"",
        { stdio: "ignore" },
      );
      return;
    }
    execSync("lsof -ti tcp:3210,3211 | xargs kill -9", { stdio: "ignore" });
  } catch (error) {
    console.warn(
      "Unable to auto-stop the existing Convex backend. Stop it manually if tests fail.",
    );
  }
};

const waitForBackendReady = async () => {
  const timeoutMs = 30_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getBackendStatus();
    if (status === "ready") {
      return;
    }
    await sleep(500);
  }
  throw new Error("Convex backend did not become ready within 30s.");
};

const keepAlive = () => {
  setInterval(() => {}, 60_000);
};

const main = async () => {
  if (await isBackendRunning()) {
    const status = await getBackendStatus();
    if (status === "ready") {
      console.log("Convex local backend already running. Reusing it for Playwright.");
      keepAlive();
      return;
    }
    console.log(
      "Convex local backend is running but missing required functions. Restarting it.",
    );
    stopExistingBackend();
    await sleep(500);
  }

  const child = spawn(
    "npx",
    [
      "convex",
      "dev",
      "--local",
      "--local-force-upgrade",
      "--tail-logs",
      "disable",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );

  await waitForBackendReady();

  const forwardSignal = (signal) => {
    child.kill(signal);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  process.on("SIGBREAK", () => forwardSignal("SIGBREAK"));

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
