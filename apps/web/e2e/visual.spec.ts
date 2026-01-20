import { expect, test, type Page } from "@playwright/test";
import { ADMIN_GUILD_COOKIE, MEMBER_GUILD_COOKIE } from "../lib/guildSelection";
import { ADMIN_SESSION_COOKIE, encodeSession } from "../lib/session";
import { ensureConvexTestData } from "./convexTestData";

let seeded: Awaited<ReturnType<typeof ensureConvexTestData>>;
const fixedTimestamp = Date.UTC(2025, 0, 1, 12, 0, 0);

async function prepareVisualPage(page: Page) {
  await page.addInitScript(
    ({ fixedTimestamp }) => {
      const OriginalDate = Date;
      class MockDate extends OriginalDate {
        constructor(...args: ConstructorParameters<typeof Date> | []) {
          if (args.length === 0) {
            super(fixedTimestamp);
            return;
          }
          super(...(args as ConstructorParameters<typeof Date>));
        }
        static now() {
          return fixedTimestamp;
        }
      }
      MockDate.UTC = OriginalDate.UTC;
      MockDate.parse = OriginalDate.parse;
      globalThis.Date = MockDate as unknown as DateConstructor;

      const style = document.createElement("style");
      style.setAttribute("data-visual-test", "true");
      style.textContent = `
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
      document.head.appendChild(style);
    },
    { fixedTimestamp },
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
}

const addAdminSession = async (page: Page, baseURL: string, guildId: string) => {
  const sessionSecret = process.env.PERKCORD_SESSION_SECRET ?? "playwright-smoke-secret";
  const token = encodeSession(
    {
      userId: "admin_test_user",
      username: "Perkcord Admin",
      issuedAt: fixedTimestamp,
    },
    sessionSecret,
  );

  await page.context().addCookies([
    {
      name: ADMIN_SESSION_COOKIE,
      value: token,
      url: baseURL,
    },
    {
      name: ADMIN_GUILD_COOKIE,
      value: guildId,
      url: baseURL,
    },
  ]);
};

test.describe("visual", () => {
  test.beforeAll(async () => {
    seeded = await ensureConvexTestData();
  });

  test("landing page @visual", async ({ page }) => {
    await prepareVisualPage(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Automated paid access for Discord." })).toBeVisible();

    await expect(page).toHaveScreenshot("home-viewport.png");
    await expect(page).toHaveScreenshot("home-full.png", {
      fullPage: true,
    });
  });

  test("admin login @visual", async ({ page }) => {
    await prepareVisualPage(page);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();

    await expect(page).toHaveScreenshot("admin-login-viewport.png");
    await expect(page).toHaveScreenshot("admin-login-full.png", {
      fullPage: true,
    });
  });

  test("admin pages @visual", async ({ page }, testInfo) => {
    await prepareVisualPage(page);
    const baseURL = new URL(
      (testInfo.project.use.baseURL as string | undefined) ?? "http://127.0.0.1:3001",
    );
    await addAdminSession(page, baseURL.origin, seeded.guildId);

    await page.goto("/admin/overview");
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("admin-overview-viewport.png");
    await expect(page).toHaveScreenshot("admin-overview-full.png", { fullPage: true });

    await page.getByRole("link", { name: "Members" }).click();
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("admin-members-viewport.png");
    await expect(page).toHaveScreenshot("admin-members-full.png", { fullPage: true });

    await page.getByRole("link", { name: "Tiers" }).click();
    await expect(page.getByRole("heading", { name: "Tiers", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("admin-tiers-viewport.png");
    await expect(page).toHaveScreenshot("admin-tiers-full.png", { fullPage: true });

    await page.getByRole("link", { name: "Ops" }).click();
    await expect(page.getByRole("heading", { name: "Ops", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("admin-ops-viewport.png");
    await expect(page).toHaveScreenshot("admin-ops-full.png", { fullPage: true });
  });

  test("member flow stub pages @visual", async ({ page }, testInfo) => {
    await prepareVisualPage(page);

    const baseURL =
      (testInfo.project.use.baseURL as string | undefined) ?? "http://127.0.0.1:3001";
    await page.context().addCookies([
      {
        name: MEMBER_GUILD_COOKIE,
        value: seeded.discordGuildId,
        url: baseURL,
      },
    ]);
    await page.goto(`/subscribe`);
    await expect(page.getByRole("heading", { name: "Pick your tier" })).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-tier-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-tier-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/connect?tier=starter`);
    await expect(page.getByRole("heading", { name: "Connect Discord" })).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-connect-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-connect-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/pay?tier=starter`);
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-pay-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-pay-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/celebrate?tier=starter`);
    await expect(page.getByRole("heading", { name: "You are in" })).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-celebrate-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-celebrate-full.png", {
      fullPage: true,
    });
  });
});
