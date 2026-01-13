export type StripeCheckoutMode = "subscription" | "payment";

export type StripeCheckoutConfig = {
  mode: StripeCheckoutMode;
  priceId: string;
};

export type StripeCheckoutConfigResult =
  | { ok: true; config: StripeCheckoutConfig }
  | { ok: false; error: string };

export type StripeTierConfig = {
  entitlementPolicy: {
    kind: "subscription" | "one_time";
    isLifetime?: boolean;
  };
  providerRefs?: {
    stripeSubscriptionPriceIds?: string[];
    stripeOneTimePriceIds?: string[];
  };
};

const pickFirst = (values?: string[]) => values?.find((value) => value.trim().length > 0);

export const resolveStripeCheckoutConfig = (tier: StripeTierConfig): StripeCheckoutConfigResult => {
  const mode: StripeCheckoutMode =
    tier.entitlementPolicy.kind === "subscription" ? "subscription" : "payment";
  const priceId =
    mode === "subscription"
      ? pickFirst(tier.providerRefs?.stripeSubscriptionPriceIds)
      : pickFirst(tier.providerRefs?.stripeOneTimePriceIds);

  if (!priceId) {
    return {
      ok: false,
      error:
        mode === "subscription"
          ? "Stripe subscription price ID is not configured for this tier."
          : "Stripe one-time price ID is not configured for this tier.",
    };
  }

  return {
    ok: true,
    config: {
      mode,
      priceId,
    },
  };
};
