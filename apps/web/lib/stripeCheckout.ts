export type StripeCheckoutMode = "subscription" | "payment";

type StripeTierEnvConfig = {
  subscriptionPriceEnv?: string;
  oneTimePriceEnv?: string;
};

const STRIPE_TIER_ENV: Record<string, StripeTierEnvConfig> = {
  starter: {
    subscriptionPriceEnv: "STRIPE_STARTER_SUBSCRIPTION_PRICE_ID",
    oneTimePriceEnv: "STRIPE_STARTER_ONE_TIME_PRICE_ID",
  },
  plus: {
    subscriptionPriceEnv: "STRIPE_PLUS_SUBSCRIPTION_PRICE_ID",
    oneTimePriceEnv: "STRIPE_PLUS_ONE_TIME_PRICE_ID",
  },
  legend: {
    subscriptionPriceEnv: "STRIPE_LEGEND_SUBSCRIPTION_PRICE_ID",
    oneTimePriceEnv: "STRIPE_LEGEND_ONE_TIME_PRICE_ID",
  },
};

const readEnvValue = (key?: string) => {
  if (!key) {
    return undefined;
  }
  const value = process.env[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeMode = (value?: string | null): StripeCheckoutMode | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "subscription") {
    return "subscription";
  }
  if (normalized === "payment") {
    return "payment";
  }
  return null;
};

export type StripeCheckoutConfig = {
  mode: StripeCheckoutMode;
  priceId: string;
};

export type StripeCheckoutConfigResult =
  | { ok: true; config: StripeCheckoutConfig }
  | { ok: false; error: string };

export const resolveStripeCheckoutConfig = (
  tierId: string,
  modeOverride?: string | null
): StripeCheckoutConfigResult => {
  const envConfig = STRIPE_TIER_ENV[tierId];
  if (!envConfig) {
    return { ok: false, error: "Unknown tier for Stripe checkout." };
  }

  const subscriptionPriceId = readEnvValue(envConfig.subscriptionPriceEnv);
  const oneTimePriceId = readEnvValue(envConfig.oneTimePriceEnv);
  const requestedMode = normalizeMode(modeOverride);

  if (requestedMode === "subscription") {
    if (!subscriptionPriceId) {
      return {
        ok: false,
        error: "Stripe subscription price ID is not configured for this tier.",
      };
    }
    return {
      ok: true,
      config: { mode: "subscription", priceId: subscriptionPriceId },
    };
  }

  if (requestedMode === "payment") {
    if (!oneTimePriceId) {
      return {
        ok: false,
        error: "Stripe one-time price ID is not configured for this tier.",
      };
    }
    return {
      ok: true,
      config: { mode: "payment", priceId: oneTimePriceId },
    };
  }

  if (subscriptionPriceId) {
    return {
      ok: true,
      config: { mode: "subscription", priceId: subscriptionPriceId },
    };
  }

  if (oneTimePriceId) {
    return {
      ok: true,
      config: { mode: "payment", priceId: oneTimePriceId },
    };
  }

  return {
    ok: false,
    error: "Stripe price IDs are not configured for this tier.",
  };
};
