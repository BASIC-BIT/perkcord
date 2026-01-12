import { expect, test, type Page } from "@playwright/test";

const guildId = "123456789012345678";
const fixedTimestamp = Date.UTC(2025, 0, 1, 12, 0, 0);

async function prepareVisualPage(page: Page) {
  await page.addInitScript(({ fixedTimestamp }) => {
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixedTimestamp);
          return;
        }
        super(...args);
      }
      static now() {
        return fixedTimestamp;
      }
    }

    MockDate.UTC = OriginalDate.UTC;
    MockDate.parse = OriginalDate.parse;
    globalThis.Date = MockDate;

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
  }, { fixedTimestamp });

  await page.emulateMedia({ reducedMotion: "reduce" });
}

test.describe("visual", () => {
  test("admin landing @visual", async ({ page }) => {
    await prepareVisualPage(page);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin Portal" })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("admin-landing-viewport.png");
    await expect(page).toHaveScreenshot("admin-landing-full.png", {
      fullPage: true,
    });
  });

  test("member flow stub pages @visual", async ({ page }) => {
    await prepareVisualPage(page);

    await page.goto(`/subscribe?guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "Pick your tier" })
    ).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-tier-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-tier-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/connect?tier=starter&guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "Connect Discord" })
    ).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-connect-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-connect-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/pay?tier=starter&guildId=${guildId}`);
    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-pay-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-pay-full.png", {
      fullPage: true,
    });

    await page.goto(`/subscribe/celebrate?tier=starter&guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "You are all set" })
    ).toBeVisible();
    await expect(page).toHaveScreenshot("subscribe-celebrate-viewport.png");
    await expect(page).toHaveScreenshot("subscribe-celebrate-full.png", {
      fullPage: true,
    });
  });
});
