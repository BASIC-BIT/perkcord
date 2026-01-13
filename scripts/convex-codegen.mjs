import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tmpDir = path.resolve(repoRoot, "convex", ".convex", "tmp");
mkdirSync(tmpDir, { recursive: true });

const envFile = path.resolve(repoRoot, "convex", ".env.local");
const envOverrides = {};
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
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
    if (key && !(key in process.env)) {
      envOverrides[key] = value;
    }
  }
}

const binName = process.platform === "win32" ? "convex.cmd" : "convex";
const bin = path.resolve(repoRoot, "node_modules", ".bin", binName);

const child = spawn(bin, ["codegen"], {
  stdio: "inherit",
  cwd: repoRoot,
  env: {
    ...process.env,
    ...envOverrides,
    CONVEX_TMPDIR: tmpDir,
  },
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
