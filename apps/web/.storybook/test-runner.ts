import type { TestRunnerConfig } from "@storybook/test-runner";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const snapshotDir = path.join(process.cwd(), "storybook-snapshots");
const updateSnapshots = process.env.STORYBOOK_SNAPSHOT_UPDATE === "1";
const disableAnimationsCss = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  html {
    scroll-behavior: auto !important;
  }
`;

const config: TestRunnerConfig = {
  async postRender(page, context) {
    if (context.parameters?.snapshot?.skip) {
      return;
    }

    await page.setViewportSize({ width: 960, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: disableAnimationsCss });
    await page.waitForLoadState("networkidle");

    const root = page.locator("#storybook-root");
    const target = (await root.count()) > 0 ? root : page.locator("body");

    await mkdir(snapshotDir, { recursive: true });

    const storyId = context.id;
    const snapshotPath = path.join(snapshotDir, `${storyId}.png`);
    const buffer = await target.screenshot({ type: "png" });

    if (updateSnapshots) {
      await writeFile(snapshotPath, buffer);
      return;
    }

    try {
      const existing = await readFile(snapshotPath);
      if (!existing.equals(buffer)) {
        throw new Error(
          `Storybook snapshot mismatch for ${storyId}. Run "npm run test:storybook:update" to regenerate.`,
        );
      }
    } catch (error) {
      if (isMissingSnapshot(error)) {
        await writeFile(snapshotPath, buffer);
        return;
      }
      throw error;
    }
  },
};

function isMissingSnapshot(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export default config;
