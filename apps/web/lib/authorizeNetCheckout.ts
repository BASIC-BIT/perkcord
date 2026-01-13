export type AuthorizeNetCheckoutMode = "subscription" | "one_time";

export type AuthorizeNetSubscriptionConfig = {
  mode: "subscription";
  amount: string;
  subscriptionKey: string;
  intervalLength: number;
  intervalUnit: "days" | "months";
  intervalLabel: string;
};

export type AuthorizeNetOneTimeConfig = {
  mode: "one_time";
  amount: string;
  oneTimeKey: string;
};

export type AuthorizeNetCheckoutConfig = AuthorizeNetSubscriptionConfig | AuthorizeNetOneTimeConfig;

export type AuthorizeNetTierConfig = {
  entitlementPolicy: {
    kind: "subscription" | "one_time";
    isLifetime?: boolean;
  };
  providerRefs?: {
    authorizeNetSubscriptionIds?: string[];
    authorizeNetOneTimeKeys?: string[];
  };
  checkoutConfig?: {
    authorizeNet?: {
      amount: string;
      intervalLength?: number;
      intervalUnit?: "days" | "months";
    };
  };
};

const pickFirst = (values?: string[]) => values?.find((value) => value.trim().length > 0);

const normalizeAmount = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed.toFixed(2);
};

const formatIntervalLabel = (length: number, unit: "days" | "months") => {
  if (length === 1) {
    return unit === "months" ? "month" : "day";
  }
  return `${length} ${unit}`;
};

export type AuthorizeNetCheckoutConfigResult =
  | { ok: true; config: AuthorizeNetCheckoutConfig }
  | { ok: false; error: string };

export const resolveAuthorizeNetCheckoutConfig = (
  tier: AuthorizeNetTierConfig,
): AuthorizeNetCheckoutConfigResult => {
  const checkout = tier.checkoutConfig?.authorizeNet;
  if (!checkout) {
    return { ok: false, error: "Authorize.Net checkout is not configured for this tier." };
  }
  const amount = normalizeAmount(checkout.amount);
  if (!amount) {
    return { ok: false, error: "Authorize.Net amount must be a positive number." };
  }

  if (tier.entitlementPolicy.kind === "subscription") {
    const subscriptionKey = pickFirst(tier.providerRefs?.authorizeNetSubscriptionIds);
    if (!subscriptionKey) {
      return {
        ok: false,
        error: "Authorize.Net subscription key is not configured for this tier.",
      };
    }
    const intervalLength = checkout.intervalLength;
    const intervalUnit = checkout.intervalUnit;
    if (!intervalLength || !intervalUnit) {
      return {
        ok: false,
        error: "Authorize.Net subscription interval is not configured for this tier.",
      };
    }
    if (intervalUnit === "months" && intervalLength > 12) {
      return { ok: false, error: "Authorize.Net interval length cannot exceed 12 months." };
    }
    if (intervalUnit === "days" && intervalLength > 365) {
      return { ok: false, error: "Authorize.Net interval length cannot exceed 365 days." };
    }
    return {
      ok: true,
      config: {
        mode: "subscription",
        amount,
        subscriptionKey,
        intervalLength,
        intervalUnit,
        intervalLabel: formatIntervalLabel(intervalLength, intervalUnit),
      },
    };
  }

  const oneTimeKey = pickFirst(tier.providerRefs?.authorizeNetOneTimeKeys);
  if (!oneTimeKey) {
    return {
      ok: false,
      error: "Authorize.Net one-time key is not configured for this tier.",
    };
  }

  return {
    ok: true,
    config: {
      mode: "one_time",
      amount,
      oneTimeKey,
    },
  };
};
