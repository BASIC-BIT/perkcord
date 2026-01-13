import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthorizeNetCheckoutConfig } from "./authorizeNetCheckout";

const AUTHORIZE_KEYS = [
  "AUTHORIZE_NET_STARTER_ONE_TIME_KEY",
  "AUTHORIZE_NET_STARTER_ONE_TIME_AMOUNT",
  "AUTHORIZE_NET_STARTER_SUBSCRIPTION_KEY",
  "AUTHORIZE_NET_STARTER_SUBSCRIPTION_AMOUNT",
  "AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_LENGTH",
  "AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_UNIT",
];

const originalValues: Record<string, string | undefined> = {};

const resetAuthorizeEnv = () => {
  for (const key of AUTHORIZE_KEYS) {
    if (originalValues[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValues[key];
    }
  }
};

describe("resolveAuthorizeNetCheckoutConfig", () => {
  beforeEach(() => {
    for (const key of AUTHORIZE_KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetAuthorizeEnv();
  });

  it("returns an error for unknown tiers", () => {
    const result = resolveAuthorizeNetCheckoutConfig("unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown tier");
    }
  });

  it("prefers subscription config when fully configured", () => {
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_KEY = "sub_key";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_AMOUNT = "20";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_LENGTH = "1";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_UNIT = "month";
    process.env.AUTHORIZE_NET_STARTER_ONE_TIME_KEY = "one_time_key";
    process.env.AUTHORIZE_NET_STARTER_ONE_TIME_AMOUNT = "10";

    const result = resolveAuthorizeNetCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok && result.config.mode === "subscription") {
      expect(result.config.amount).toBe("20.00");
      expect(result.config.intervalLabel).toBe("month");
    }
  });

  it("falls back to one-time when subscription config is invalid", () => {
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_KEY = "sub_key";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_AMOUNT = "20";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_LENGTH = "40";
    process.env.AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_UNIT = "month";
    process.env.AUTHORIZE_NET_STARTER_ONE_TIME_KEY = "one_time_key";
    process.env.AUTHORIZE_NET_STARTER_ONE_TIME_AMOUNT = "15";

    const result = resolveAuthorizeNetCheckoutConfig("starter");
    expect(result.ok).toBe(true);
    if (result.ok && result.config.mode === "one_time") {
      expect(result.config.amount).toBe("15.00");
      expect(result.config.oneTimeKey).toBe("one_time_key");
    }
  });

  it("errors when no checkout configuration is available", () => {
    const result = resolveAuthorizeNetCheckoutConfig("starter");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not configured");
    }
  });
});
