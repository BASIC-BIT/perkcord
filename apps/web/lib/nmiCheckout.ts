export type NmiCheckoutMode = "subscription" | "one_time";

export type NmiCheckoutConfig = {
  hostedUrl: string;
  mode: NmiCheckoutMode;
};

export type NmiTierConfig = {
  entitlementPolicy: {
    kind: "subscription" | "one_time";
    isLifetime?: boolean;
  };
  checkoutConfig?: {
    nmi?: {
      hostedUrl: string;
    };
  };
};

const normalizeUrl = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
};

export type NmiCheckoutConfigResult =
  | { ok: true; config: NmiCheckoutConfig }
  | { ok: false; error: string };

export const resolveNmiCheckoutConfig = (tier: NmiTierConfig): NmiCheckoutConfigResult => {
  const hostedUrl = normalizeUrl(tier.checkoutConfig?.nmi?.hostedUrl);
  if (!hostedUrl) {
    return {
      ok: false,
      error: "NMI hosted checkout URL is not configured for this tier.",
    };
  }
  const mode: NmiCheckoutMode =
    tier.entitlementPolicy.kind === "subscription" ? "subscription" : "one_time";
  return { ok: true, config: { hostedUrl, mode } };
};
