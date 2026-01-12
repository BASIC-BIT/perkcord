import { expect, test } from "@playwright/test";

const guildId = "123456789012345678";

test.describe("smoke", () => {
  test("admin login landing renders", async ({ page }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Admin Portal" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in with Discord" })
    ).toBeVisible();
  });

  test("member flow stub pages render", async ({ page }) => {
    await page.goto(`/subscribe?guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "Pick your tier" })
    ).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    await page.goto(`/subscribe/connect?tier=starter&guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "Connect Discord" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Connect Discord" })
    ).toBeVisible();

    await page.goto(`/subscribe/pay?tier=starter&guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "Payment" })
    ).toBeVisible();
    await expect(page.getByText("Stripe checkout")).toBeVisible();
    await expect(page.getByText("Authorize.Net checkout")).toBeVisible();

    await page.goto(`/subscribe/celebrate?tier=starter&guildId=${guildId}`);
    await expect(
      page.getByRole("heading", { name: "You are all set" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Discord server" })
    ).toBeVisible();
  });
});
