import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveNmiCheckoutConfig } from "./nmiCheckout";

const NMI_KEYS = [
  "NMI_STARTER_HOSTED_URL",
  "NMI_STARTER_MODE",
  "NMI_PLUS_HOSTED_URL",
  "NMI_PLUS_MODE",
  "NMI_LEGEND_HOSTED_URL",
  "NMI_LEGEND_MODE",
];

const originalValues: Record<string, string | undefined> = {};

const resetNmiEnv = () => {
  for (const key of NMI_KEYS) {
    if (originalValues[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValues[key];
    }
  }
};

describe("resolveNmiCheckoutConfig", () => {
  beforeEach(() => {
    for (const key of NMI_KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetNmiEnv();
  });

  it("returns an error for unknown tiers", () => {
    const result = resolveNmiCheckoutConfig("unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown tier");
    }
  });

  it("requires a hosted URL to be configured", () => {
    const result = resolveNmiCheckoutConfig("starter");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("NMI hosted checkout URL");
    }
  });

  it("accepts a valid hosted URL", () => {
    process.env.NMI_STARTER_HOSTED_URL = "https://secure.nmi.com/pay/abc";
    const result = resolveNmiCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.hostedUrl).toBe(
        "https://secure.nmi.com/pay/abc"
      );
      expect(result.config.mode).toBeNull();
    }
  });

  it("normalizes recurring modes to subscription", () => {
    process.env.NMI_STARTER_HOSTED_URL = "https://secure.nmi.com/pay/sub"; 
    process.env.NMI_STARTER_MODE = "recurring";
    const result = resolveNmiCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("subscription");
    }
  });

  it("normalizes payment modes to one_time", () => {
    process.env.NMI_STARTER_HOSTED_URL = "https://secure.nmi.com/pay/once";
    process.env.NMI_STARTER_MODE = "payment";
    const result = resolveNmiCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.mode).toBe("one_time");
    }
  });
});
