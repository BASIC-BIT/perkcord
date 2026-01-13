import { describe, expect, it } from "vitest";
import { resolveAuthorizeNetCheckoutConfig } from "./authorizeNetCheckout";

describe("resolveAuthorizeNetCheckoutConfig", () => {
  it("returns an error when checkout config is missing", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
    });
    expect(result.ok).toBe(false);
  });

  it("returns subscription config when configured", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
          intervalLength: 1,
          intervalUnit: "months",
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.config.mode === "subscription") {
      expect(result.config.amount).toBe("20.00");
      expect(result.config.subscriptionKey).toBe("sub_key");
      expect(result.config.intervalLabel).toBe("month");
    }
  });

  it("formats multi-interval labels", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
          intervalLength: 2,
          intervalUnit: "months",
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.config.mode === "subscription") {
      expect(result.config.intervalLabel).toBe("2 months");
    }
  });

  it("returns an error when amount is invalid", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "0",
          intervalLength: 1,
          intervalUnit: "months",
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it("returns an error when subscription key is missing", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
          intervalLength: 1,
          intervalUnit: "months",
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it("returns an error when subscription interval is missing", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it("returns an error when subscription interval exceeds limits", () => {
    const monthsResult = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
          intervalLength: 13,
          intervalUnit: "months",
        },
      },
    });
    expect(monthsResult.ok).toBe(false);

    const daysResult = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "subscription" },
      providerRefs: { authorizeNetSubscriptionIds: ["sub_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "20",
          intervalLength: 366,
          intervalUnit: "days",
        },
      },
    });
    expect(daysResult.ok).toBe(false);
  });

  it("returns an error when one-time key is missing", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "one_time" },
      checkoutConfig: {
        authorizeNet: {
          amount: "10",
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it("returns one-time config when configured", () => {
    const result = resolveAuthorizeNetCheckoutConfig({
      entitlementPolicy: { kind: "one_time", isLifetime: true },
      providerRefs: { authorizeNetOneTimeKeys: ["one_time_key"] },
      checkoutConfig: {
        authorizeNet: {
          amount: "15",
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.config.mode === "one_time") {
      expect(result.config.amount).toBe("15.00");
      expect(result.config.oneTimeKey).toBe("one_time_key");
    }
  });
});
