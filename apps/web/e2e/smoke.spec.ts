import { expect, test } from "@playwright/test";
import { ADMIN_SESSION_COOKIE, encodeSession } from "../lib/session";

const guildId = "123456789012345678";

test.describe("smoke", () => {
  test("admin login landing renders", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in with Discord" })).toBeVisible();
  });

  test("signed-in admin panels render", async ({ page }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL as string | undefined) ?? "http://127.0.0.1:3001";
    const sessionSecret = process.env.PERKCORD_SESSION_SECRET ?? "playwright-smoke-secret";
    const token = encodeSession(
      {
        userId: "admin_test_user",
        username: "Perkcord Admin",
        issuedAt: Date.now(),
      },
      sessionSecret,
    );

    await page.context().addCookies([
      {
        name: ADMIN_SESSION_COOKIE,
        value: token,
        url: baseURL,
        path: "/",
      },
    ]);

    await page.goto("/admin");

    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Guild selection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Force role sync" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tier management" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manual grants" })).toBeVisible();
  });

  test("member flow stub pages render", async ({ page }) => {
    await page.goto(`/subscribe?guildId=${guildId}`);
    await expect(page.getByRole("heading", { name: "Pick your tier" })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    await page.goto(`/subscribe/connect?tier=starter&guildId=${guildId}`);
    await expect(page.getByRole("heading", { name: "Connect Discord" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect Discord" })).toBeVisible();

    await page.goto(`/subscribe/pay?tier=starter&guildId=${guildId}`);
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page.getByText("Stripe checkout")).toBeVisible();
    await expect(page.getByText("Authorize.Net checkout")).toBeVisible();

    await page.goto(`/subscribe/celebrate?tier=starter&guildId=${guildId}`);
    await expect(page.getByRole("heading", { name: "You are all set" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Discord server" })).toBeVisible();
  });
});
