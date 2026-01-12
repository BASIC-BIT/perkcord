import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

type PolicyKind = "subscription" | "one_time";

const readFormValue = (form: FormData, key: string) => {
  const value = form.get(key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readFormFlag = (form: FormData, key: string) => form.get(key) !== null;

const buildRedirect = (request: Request, params: Record<string, string | undefined>) => {
  const url = new URL("/admin", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const clampMessage = (value: string, max = 160) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

const parseCommaList = (value: string | null) => {
  if (!value) {
    return null;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
};

const parseOptionalInteger = (value: string | null, label: string, options?: { min?: number }) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  if (options?.min !== undefined && parsed < options.min) {
    throw new Error(`${label} must be at least ${options.min}.`);
  }
  return parsed;
};

const parsePolicyKind = (value: string | null): PolicyKind | null => {
  if (!value) {
    return null;
  }
  if (value === "subscription" || value === "one_time") {
    return value;
  }
  throw new Error("Policy kind must be subscription or one_time.");
};

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = requireEnv("PERKCORD_SESSION_SECRET", "Session secret missing.");
  } catch (error) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: resolveEnvError(error, "Session secret missing."),
    });
  }

  const session = getSessionFromCookies(cookies(), secret);
  if (!session) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Unauthorized.",
    });
  }

  let convexUrl: string;
  let apiKey: string;
  try {
    convexUrl = requireEnv("PERKCORD_CONVEX_HTTP_URL", "Convex REST configuration missing.");
    apiKey = requireEnv("PERKCORD_REST_API_KEY", "Convex REST configuration missing.");
  } catch (error) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: resolveEnvError(error, "Convex REST configuration missing."),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Invalid form submission.",
    });
  }

  const guildId = readFormValue(form, "guildId");
  const name = readFormValue(form, "name");
  const description = readFormValue(form, "description");
  const roleIdsRaw = readFormValue(form, "roleIds");
  const policyKindRaw = readFormValue(form, "policyKind");
  const policyDurationRaw = readFormValue(form, "policyDurationDays");
  const policyGraceRaw = readFormValue(form, "policyGracePeriodDays");
  const policyLifetime = readFormFlag(form, "policyLifetime");
  const cancelAtPeriodEnd = readFormFlag(form, "policyCancelAtPeriodEnd");

  if (!guildId) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Guild ID is required.",
    });
  }
  if (!name) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Tier name is required.",
      guildId,
    });
  }
  if (!roleIdsRaw) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "At least one role ID is required.",
      guildId,
    });
  }

  let policyKind: PolicyKind | null = null;
  let durationDays: number | undefined;
  let gracePeriodDays: number | undefined;
  try {
    policyKind = parsePolicyKind(policyKindRaw);
    durationDays = parseOptionalInteger(policyDurationRaw, "Duration days", {
      min: 1,
    });
    gracePeriodDays = parseOptionalInteger(policyGraceRaw, "Grace period days", { min: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid policy.";
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: clampMessage(message),
      guildId,
    });
  }

  if (!policyKind) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Entitlement policy kind is required.",
      guildId,
    });
  }

  if (policyKind === "subscription") {
    if (durationDays !== undefined || policyLifetime) {
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: "Subscriptions cannot set duration days or lifetime.",
        guildId,
      });
    }
  }

  if (policyKind === "one_time") {
    const hasDuration = durationDays !== undefined;
    if ((hasDuration ? 1 : 0) + (policyLifetime ? 1 : 0) !== 1) {
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: "One-time tiers require duration days or lifetime (not both).",
        guildId,
      });
    }
  }

  const roleIds = parseCommaList(roleIdsRaw);
  if (!roleIds) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "At least one role ID is required.",
      guildId,
    });
  }

  const providerRefs: Record<string, string[]> = {};
  const stripeSubscriptionPriceIds = parseCommaList(
    readFormValue(form, "stripeSubscriptionPriceIds"),
  );
  if (stripeSubscriptionPriceIds) {
    providerRefs.stripeSubscriptionPriceIds = stripeSubscriptionPriceIds;
  }
  const stripeOneTimePriceIds = parseCommaList(readFormValue(form, "stripeOneTimePriceIds"));
  if (stripeOneTimePriceIds) {
    providerRefs.stripeOneTimePriceIds = stripeOneTimePriceIds;
  }
  const authorizeNetSubscriptionIds = parseCommaList(
    readFormValue(form, "authorizeNetSubscriptionIds"),
  );
  if (authorizeNetSubscriptionIds) {
    providerRefs.authorizeNetSubscriptionIds = authorizeNetSubscriptionIds;
  }
  const authorizeNetOneTimeKeys = parseCommaList(readFormValue(form, "authorizeNetOneTimeKeys"));
  if (authorizeNetOneTimeKeys) {
    providerRefs.authorizeNetOneTimeKeys = authorizeNetOneTimeKeys;
  }
  const nmiPlanIds = parseCommaList(readFormValue(form, "nmiPlanIds"));
  if (nmiPlanIds) {
    providerRefs.nmiPlanIds = nmiPlanIds;
  }
  const nmiOneTimeKeys = parseCommaList(readFormValue(form, "nmiOneTimeKeys"));
  if (nmiOneTimeKeys) {
    providerRefs.nmiOneTimeKeys = nmiOneTimeKeys;
  }

  const endpoint = `${normalizeBaseUrl(convexUrl)}/api/tiers`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      body: JSON.stringify({
        guildId,
        name,
        description: description ?? undefined,
        roleIds,
        entitlementPolicy: {
          kind: policyKind,
          durationDays: durationDays ?? undefined,
          isLifetime: policyLifetime ? true : undefined,
          gracePeriodDays: gracePeriodDays ?? undefined,
          cancelAtPeriodEnd: cancelAtPeriodEnd ? true : undefined,
        },
        providerRefs: Object.keys(providerRefs).length > 0 ? providerRefs : undefined,
        actorId: session.userId,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error ?? `Tier creation failed with status ${response.status}.`;
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: clampMessage(String(message)),
        guildId,
      });
    }

    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "success",
      tierId: payload?.tierId ? String(payload.tierId) : undefined,
      guildId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tier creation failed.";
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: clampMessage(message),
      guildId,
    });
  }
}
