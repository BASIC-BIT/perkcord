export type AuthorizeNetCheckoutConfig = {
  amount: string;
  oneTimeKey: string;
};

type AuthorizeNetTierEnvConfig = {
  oneTimeKeyEnv?: string;
  oneTimeAmountEnv?: string;
};

const AUTHORIZE_NET_TIER_ENV: Record<string, AuthorizeNetTierEnvConfig> = {
  starter: {
    oneTimeKeyEnv: "AUTHORIZE_NET_STARTER_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_STARTER_ONE_TIME_AMOUNT",
  },
  plus: {
    oneTimeKeyEnv: "AUTHORIZE_NET_PLUS_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_PLUS_ONE_TIME_AMOUNT",
  },
  legend: {
    oneTimeKeyEnv: "AUTHORIZE_NET_LEGEND_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_LEGEND_ONE_TIME_AMOUNT",
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

export type AuthorizeNetCheckoutConfigResult =
  | { ok: true; config: AuthorizeNetCheckoutConfig }
  | { ok: false; error: string };

export const resolveAuthorizeNetCheckoutConfig = (
  tierId: string
): AuthorizeNetCheckoutConfigResult => {
  const envConfig = AUTHORIZE_NET_TIER_ENV[tierId];
  if (!envConfig) {
    return { ok: false, error: "Unknown tier for Authorize.Net checkout." };
  }

  const oneTimeKey = readEnvValue(envConfig.oneTimeKeyEnv);
  const amount = normalizeAmount(readEnvValue(envConfig.oneTimeAmountEnv));

  if (!oneTimeKey || !amount) {
    return {
      ok: false,
      error: "Authorize.Net one-time checkout is not configured for this tier.",
    };
  }

  return {
    ok: true,
    config: {
      amount,
      oneTimeKey,
    },
  };
};
