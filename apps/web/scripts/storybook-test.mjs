import { spawn } from "node:child_process";

const updateSnapshots = process.argv.includes("--update");
const env = { ...process.env };

if (updateSnapshots) {
  env.STORYBOOK_SNAPSHOT_UPDATE = "1";
}

const args = ["test-storybook", "--url", "http://127.0.0.1:6006"];
const child = spawn(args[0], args.slice(1), {
  env,
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
