export type NmiCheckoutMode = "subscription" | "one_time";

export type NmiCheckoutConfig = {
  hostedUrl: string;
  mode: NmiCheckoutMode | null;
};

type NmiTierEnvConfig = {
  hostedUrlEnv?: string;
  modeEnv?: string;
};

const NMI_TIER_ENV: Record<string, NmiTierEnvConfig> = {
  starter: {
    hostedUrlEnv: "NMI_STARTER_HOSTED_URL",
    modeEnv: "NMI_STARTER_MODE",
  },
  plus: {
    hostedUrlEnv: "NMI_PLUS_HOSTED_URL",
    modeEnv: "NMI_PLUS_MODE",
  },
  legend: {
    hostedUrlEnv: "NMI_LEGEND_HOSTED_URL",
    modeEnv: "NMI_LEGEND_MODE",
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

const normalizeMode = (value?: string) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "subscription" ||
    normalized === "recurring" ||
    normalized === "recurrence"
  ) {
    return "subscription" as const;
  }
  if (
    normalized === "one_time" ||
    normalized === "one-time" ||
    normalized === "onetime" ||
    normalized === "payment"
  ) {
    return "one_time" as const;
  }
  return null;
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

export const resolveNmiCheckoutConfig = (
  tierId: string
): NmiCheckoutConfigResult => {
  const envConfig = NMI_TIER_ENV[tierId];
  if (!envConfig) {
    return { ok: false, error: "Unknown tier for NMI checkout." };
  }

  const hostedUrl = normalizeUrl(readEnvValue(envConfig.hostedUrlEnv));
  if (!hostedUrl) {
    return {
      ok: false,
      error: "NMI hosted checkout URL is not configured for this tier.",
    };
  }

  const mode = normalizeMode(readEnvValue(envConfig.modeEnv));
  return { ok: true, config: { hostedUrl, mode } };
};
