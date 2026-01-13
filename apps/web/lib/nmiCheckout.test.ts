import { describe, expect, it } from "vitest";
import { resolveNmiCheckoutConfig } from "./nmiCheckout";

describe("resolveNmiCheckoutConfig", () => {
  it("returns an error when hosted URL is missing", () => {
    const result = resolveNmiCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
    });
    expect(result.ok).toBe(false);
  });

  it("returns subscription config when hosted URL is provided", () => {
    const result = resolveNmiCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      checkoutConfig: { nmi: { hostedUrl: "https://example.com/checkout" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("subscription");
    }
  });

  it("returns one-time config for one-time tiers", () => {
    const result = resolveNmiCheckoutConfig({
      entitlementPolicy: { kind: "one_time", isLifetime: true },
      checkoutConfig: { nmi: { hostedUrl: "https://example.com/pay" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("one_time");
    }
  });
});
