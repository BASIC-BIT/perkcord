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

export type AuthorizeNetCheckoutConfig =
  | AuthorizeNetSubscriptionConfig
  | AuthorizeNetOneTimeConfig;

type AuthorizeNetTierEnvConfig = {
  oneTimeKeyEnv?: string;
  oneTimeAmountEnv?: string;
  subscriptionKeyEnv?: string;
  subscriptionAmountEnv?: string;
  subscriptionIntervalLengthEnv?: string;
  subscriptionIntervalUnitEnv?: string;
};

const AUTHORIZE_NET_TIER_ENV: Record<string, AuthorizeNetTierEnvConfig> = {
  starter: {
    oneTimeKeyEnv: "AUTHORIZE_NET_STARTER_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_STARTER_ONE_TIME_AMOUNT",
    subscriptionKeyEnv: "AUTHORIZE_NET_STARTER_SUBSCRIPTION_KEY",
    subscriptionAmountEnv: "AUTHORIZE_NET_STARTER_SUBSCRIPTION_AMOUNT",
    subscriptionIntervalLengthEnv:
      "AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_LENGTH",
    subscriptionIntervalUnitEnv:
      "AUTHORIZE_NET_STARTER_SUBSCRIPTION_INTERVAL_UNIT",
  },
  plus: {
    oneTimeKeyEnv: "AUTHORIZE_NET_PLUS_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_PLUS_ONE_TIME_AMOUNT",
    subscriptionKeyEnv: "AUTHORIZE_NET_PLUS_SUBSCRIPTION_KEY",
    subscriptionAmountEnv: "AUTHORIZE_NET_PLUS_SUBSCRIPTION_AMOUNT",
    subscriptionIntervalLengthEnv:
      "AUTHORIZE_NET_PLUS_SUBSCRIPTION_INTERVAL_LENGTH",
    subscriptionIntervalUnitEnv:
      "AUTHORIZE_NET_PLUS_SUBSCRIPTION_INTERVAL_UNIT",
  },
  legend: {
    oneTimeKeyEnv: "AUTHORIZE_NET_LEGEND_ONE_TIME_KEY",
    oneTimeAmountEnv: "AUTHORIZE_NET_LEGEND_ONE_TIME_AMOUNT",
    subscriptionKeyEnv: "AUTHORIZE_NET_LEGEND_SUBSCRIPTION_KEY",
    subscriptionAmountEnv: "AUTHORIZE_NET_LEGEND_SUBSCRIPTION_AMOUNT",
    subscriptionIntervalLengthEnv:
      "AUTHORIZE_NET_LEGEND_SUBSCRIPTION_INTERVAL_LENGTH",
    subscriptionIntervalUnitEnv:
      "AUTHORIZE_NET_LEGEND_SUBSCRIPTION_INTERVAL_UNIT",
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

const normalizeIntervalUnit = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "month" || trimmed === "months") {
    return "months";
  }
  if (trimmed === "day" || trimmed === "days") {
    return "days";
  }
  return undefined;
};

const normalizeIntervalLength = (value?: string, unit?: "days" | "months") => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  if (unit === "months" && parsed > 12) {
    return undefined;
  }
  if (unit === "days" && parsed > 365) {
    return undefined;
  }
  return parsed;
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
  tierId: string
): AuthorizeNetCheckoutConfigResult => {
  const envConfig = AUTHORIZE_NET_TIER_ENV[tierId];
  if (!envConfig) {
    return { ok: false, error: "Unknown tier for Authorize.Net checkout." };
  }

  const subscriptionKey = readEnvValue(envConfig.subscriptionKeyEnv);
  const subscriptionAmount = normalizeAmount(
    readEnvValue(envConfig.subscriptionAmountEnv)
  );
  const subscriptionUnit = normalizeIntervalUnit(
    readEnvValue(envConfig.subscriptionIntervalUnitEnv)
  );
  const subscriptionLength = normalizeIntervalLength(
    readEnvValue(envConfig.subscriptionIntervalLengthEnv),
    subscriptionUnit
  );

  if (
    subscriptionKey &&
    subscriptionAmount &&
    subscriptionUnit &&
    subscriptionLength
  ) {
    return {
      ok: true,
      config: {
        mode: "subscription",
        amount: subscriptionAmount,
        subscriptionKey,
        intervalLength: subscriptionLength,
        intervalUnit: subscriptionUnit,
        intervalLabel: formatIntervalLabel(
          subscriptionLength,
          subscriptionUnit
        ),
      },
    };
  }

  const oneTimeKey = readEnvValue(envConfig.oneTimeKeyEnv);
  const amount = normalizeAmount(readEnvValue(envConfig.oneTimeAmountEnv));

  if (!oneTimeKey || !amount) {
    return {
      ok: false,
      error: "Authorize.Net checkout is not configured for this tier.",
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
