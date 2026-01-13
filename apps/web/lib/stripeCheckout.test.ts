import { describe, expect, it } from "vitest";
import { resolveStripeCheckoutConfig } from "./stripeCheckout";

describe("resolveStripeCheckoutConfig", () => {
  it("returns an error when subscription price ID is missing", () => {
    const result = resolveStripeCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("subscription price");
    }
  });

  it("returns a subscription config when price ID exists", () => {
    const result = resolveStripeCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { stripeSubscriptionPriceIds: ["price_sub"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("subscription");
      expect(result.config.priceId).toBe("price_sub");
    }
  });

  it("returns a payment config for one-time tiers", () => {
    const result = resolveStripeCheckoutConfig({
      entitlementPolicy: { kind: "one_time", isLifetime: true },
      providerRefs: { stripeOneTimePriceIds: ["price_one"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("payment");
      expect(result.config.priceId).toBe("price_one");
    }
  });

  it("returns an error when one-time price ID is missing", () => {
    const result = resolveStripeCheckoutConfig({
      entitlementPolicy: { kind: "one_time", isLifetime: true },
      providerRefs: { stripeOneTimePriceIds: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("one-time price");
    }
  });
});
