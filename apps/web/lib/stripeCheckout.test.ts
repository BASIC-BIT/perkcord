import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStripeCheckoutConfig } from "./stripeCheckout";

const STRIPE_KEYS = [
  "STRIPE_STARTER_SUBSCRIPTION_PRICE_ID",
  "STRIPE_STARTER_ONE_TIME_PRICE_ID",
];

const originalValues: Record<string, string | undefined> = {};

const resetStripeEnv = () => {
  for (const key of STRIPE_KEYS) {
    if (originalValues[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValues[key];
    }
  }
};

describe("resolveStripeCheckoutConfig", () => {
  beforeEach(() => {
    for (const key of STRIPE_KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetStripeEnv();
  });

  it("returns an error for unknown tiers", () => {
    const result = resolveStripeCheckoutConfig("unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown tier");
    }
  });

  it("rejects subscription override when missing subscription price", () => {
    process.env.STRIPE_STARTER_ONE_TIME_PRICE_ID = "price_one";
    const result = resolveStripeCheckoutConfig("starter", "subscription");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("subscription price");
    }
  });

  it("resolves a one-time checkout when only one-time price exists", () => {
    process.env.STRIPE_STARTER_ONE_TIME_PRICE_ID = "price_one";
    const result = resolveStripeCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("payment");
      expect(result.config.priceId).toBe("price_one");
    }
  });

  it("honors subscription override when both prices are present", () => {
    process.env.STRIPE_STARTER_SUBSCRIPTION_PRICE_ID = "price_sub";
    process.env.STRIPE_STARTER_ONE_TIME_PRICE_ID = "price_one";
    const result = resolveStripeCheckoutConfig("starter", "subscription");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("subscription");
      expect(result.config.priceId).toBe("price_sub");
    }
  });
});
