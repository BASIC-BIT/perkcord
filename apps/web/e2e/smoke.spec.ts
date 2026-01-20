import { expect, test } from "@playwright/test";
import { ADMIN_GUILD_COOKIE, MEMBER_GUILD_COOKIE } from "../lib/guildSelection";
import { ADMIN_SESSION_COOKIE, encodeSession } from "../lib/session";
import { ensureConvexTestData } from "./convexTestData";

let seeded: Awaited<ReturnType<typeof ensureConvexTestData>>;

test.beforeAll(async () => {
  seeded = await ensureConvexTestData();
});

test.describe("smoke", () => {
  test("admin login landing renders", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in with Discord" })).toBeVisible();
  });

  test("signed-in admin panels render", async ({ page }, testInfo) => {
    const baseURL = new URL(
      (testInfo.project.use.baseURL as string | undefined) ?? "http://127.0.0.1:3001",
    );
    const sessionSecret = process.env.PERKCORD_SESSION_SECRET ?? "playwright-smoke-secret";
    const token = encodeSession(
      {
        userId: "admin_test_user",
        username: "Perkcord Admin",
        issuedAt: Date.UTC(2025, 0, 1, 12, 0, 0),
      },
      sessionSecret,
    );

    await page.context().addCookies([
      {
        name: ADMIN_SESSION_COOKIE,
        value: token,
        url: baseURL.toString(),
      },
      {
        name: ADMIN_GUILD_COOKIE,
        value: seeded.guildId,
        url: baseURL.toString(),
      },
    ]);

    await page.goto(`/admin/overview`);
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByText("Convex REST configuration missing")).toHaveCount(0);

    await page.getByRole("link", { name: "Members" }).click();
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByText("Convex REST configuration missing")).toHaveCount(0);

    await page.getByRole("link", { name: "Tiers" }).click();
    await expect(page.getByRole("heading", { name: "Tiers", exact: true })).toBeVisible();
    await expect(page.getByText("Convex REST configuration missing")).toHaveCount(0);

    await page.getByRole("link", { name: "Ops" }).click();
    await expect(page.getByRole("heading", { name: "Ops", exact: true })).toBeVisible();
    await expect(page.getByText("Convex REST configuration missing")).toHaveCount(0);
  });

  test("member flow pages render with clicks", async ({ page }, testInfo) => {
    const baseURL = new URL(
      (testInfo.project.use.baseURL as string | undefined) ?? "http://127.0.0.1:3001",
    );
    await page.context().addCookies([
      {
        name: MEMBER_GUILD_COOKIE,
        value: seeded.discordGuildId,
        url: baseURL.toString(),
      },
    ]);
    await page.goto(`/subscribe`);
    await expect(page.getByRole("heading", { name: "Pick your tier" })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByText("No tiers are configured")).toHaveCount(0);

    await page.getByRole("link", { name: "Choose Starter" }).click();
    await expect(page.getByRole("heading", { name: "Connect Discord" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect Discord" })).toBeVisible();

    await page.goto(`/subscribe/pay?tier=starter`);
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page.getByText("No payment methods are configured yet.")).toBeVisible();
    await page.getByRole("link", { name: "Back to connect" }).click();
    await expect(page.getByRole("heading", { name: "Connect Discord" })).toBeVisible();

    await page.goto(`/subscribe/celebrate?tier=starter`);
    await expect(page.getByRole("heading", { name: "You are in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Discord server" })).toBeVisible();
    await page.getByRole("link", { name: "Return home" }).click();
    await expect(
      page.getByRole("heading", { name: "Automated paid access for Discord." }),
    ).toBeVisible();
  });
});
