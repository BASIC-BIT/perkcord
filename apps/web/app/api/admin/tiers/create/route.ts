import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

type PurchaseType = "subscription" | "one_time" | "lifetime";

const readFormValue = (form: FormData, key: string) => {
  const value = form.get(key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
const parseOptionalBoolean = (value: string | null, label: string) => {
  if (value === null) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${label} must be true or false.`);
};

const buildRedirect = (request: Request, params: Record<string, string | undefined>) => {
  const url = new URL("/admin/tiers", request.url);
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

const parseList = (value: string | null) => {
  if (!value) {
    return null;
  }
  const items = value
    .split(/[\n,]/)
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

const parsePurchaseType = (value: string | null): PurchaseType | null => {
  if (!value) {
    return null;
  }
  if (value === "subscription" || value === "one_time" || value === "lifetime") {
    return value;
  }
  throw new Error("Purchase type must be subscription, one_time, or lifetime.");
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
  const slug = readFormValue(form, "slug");
  const name = readFormValue(form, "name");
  const description = readFormValue(form, "description");
  const displayPrice = readFormValue(form, "displayPrice");
  const perksRaw = readFormValue(form, "perks");
  const sortOrderRaw = readFormValue(form, "sortOrder");
  const roleIdsRaw = readFormValue(form, "roleIds");
  const purchaseTypeRaw = readFormValue(form, "purchaseType");
  const policyDurationRaw = readFormValue(form, "policyDurationDays");
  const policyGraceRaw = readFormValue(form, "policyGracePeriodDays");
  const cancelAtPeriodEndRaw = readFormValue(form, "policyCancelAtPeriodEnd");
  const stripePriceIdsRaw = readFormValue(form, "stripePriceIds");
  const authorizeNetKeyRaw = readFormValue(form, "authorizeNetKey");
  const authorizeNetAmountRaw = readFormValue(form, "authorizeNetAmount");
  const authorizeNetIntervalLengthRaw = readFormValue(form, "authorizeNetIntervalLength");
  const authorizeNetIntervalUnitRaw = readFormValue(form, "authorizeNetIntervalUnit");
  const nmiKeyRaw = readFormValue(form, "nmiKey");
  const nmiHostedUrlRaw = readFormValue(form, "nmiHostedUrl");

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
  if (!slug) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Tier slug is required.",
      guildId,
    });
  }
  if (!displayPrice) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Display price is required.",
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

  let purchaseType: PurchaseType | null = null;
  let durationDays: number | undefined;
  let gracePeriodDays: number | undefined;
  let cancelAtPeriodEnd: boolean | undefined;
  let sortOrder: number | undefined;
  let authorizeNetIntervalLength: number | undefined;
  try {
    purchaseType = parsePurchaseType(purchaseTypeRaw);
    durationDays = parseOptionalInteger(policyDurationRaw, "Duration days", {
      min: 1,
    });
    gracePeriodDays = parseOptionalInteger(policyGraceRaw, "Grace period days", { min: 0 });
    cancelAtPeriodEnd = parseOptionalBoolean(
      cancelAtPeriodEndRaw,
      "Cancel at period end",
    );
    sortOrder = parseOptionalInteger(sortOrderRaw, "Sort order", { min: 0 });
    authorizeNetIntervalLength = parseOptionalInteger(
      authorizeNetIntervalLengthRaw,
      "Authorize.Net interval length",
      { min: 1 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid policy.";
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: clampMessage(message),
      guildId,
    });
  }

  if (!purchaseType) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "Purchase type is required.",
      guildId,
    });
  }

  if (purchaseType === "subscription") {
    if (durationDays !== undefined) {
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: "Subscriptions cannot set duration days.",
        guildId,
      });
    }
  }

  if (purchaseType === "one_time") {
    if (durationDays === undefined) {
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: "One-time tiers require duration days.",
        guildId,
      });
    }
  }

  if (purchaseType === "lifetime") {
    if (durationDays !== undefined) {
      return buildRedirect(request, {
        tierAction: "create",
        tierStatus: "error",
        tierMessage: "Lifetime tiers cannot set duration days.",
        guildId,
      });
    }
  }

  const roleIds = parseList(roleIdsRaw);
  if (!roleIds) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "At least one role ID is required.",
      guildId,
    });
  }

  const perks = parseList(perksRaw);
  if (!perks || perks.length === 0) {
    return buildRedirect(request, {
      tierAction: "create",
      tierStatus: "error",
      tierMessage: "At least one perk is required.",
      guildId,
    });
  }

  const providerRefs: Record<string, string[]> = {};
  const stripePriceIds = parseList(stripePriceIdsRaw);
  const authorizeNetKeys = parseList(authorizeNetKeyRaw);
  const nmiKeys = parseList(nmiKeyRaw);

  if (purchaseType === "subscription") {
    if (stripePriceIds) {
      providerRefs.stripeSubscriptionPriceIds = stripePriceIds;
    }
    if (authorizeNetKeys) {
      providerRefs.authorizeNetSubscriptionIds = authorizeNetKeys;
    }
    if (nmiKeys) {
      providerRefs.nmiPlanIds = nmiKeys;
    }
  } else {
    if (stripePriceIds) {
      providerRefs.stripeOneTimePriceIds = stripePriceIds;
    }
    if (authorizeNetKeys) {
      providerRefs.authorizeNetOneTimeKeys = authorizeNetKeys;
    }
    if (nmiKeys) {
      providerRefs.nmiOneTimeKeys = nmiKeys;
    }
  }

  const checkoutConfig: Record<string, unknown> = {};
  if (authorizeNetAmountRaw) {
    const authorizeNet: Record<string, unknown> = {
      amount: authorizeNetAmountRaw,
    };
    if (purchaseType === "subscription") {
      authorizeNet.intervalLength = authorizeNetIntervalLength ?? undefined;
      authorizeNet.intervalUnit = authorizeNetIntervalUnitRaw ?? undefined;
    }
    checkoutConfig.authorizeNet = authorizeNet;
  }
  if (nmiHostedUrlRaw) {
    checkoutConfig.nmi = {
      hostedUrl: nmiHostedUrlRaw,
    };
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
        slug,
        name,
        description: description ?? undefined,
        displayPrice,
        perks,
        sortOrder: sortOrder ?? undefined,
        roleIds,
        entitlementPolicy: {
          kind: purchaseType === "subscription" ? "subscription" : "one_time",
          durationDays: purchaseType === "one_time" ? (durationDays ?? undefined) : undefined,
          isLifetime: purchaseType === "lifetime" ? true : undefined,
          gracePeriodDays:
            purchaseType === "subscription" ? (gracePeriodDays ?? undefined) : undefined,
          cancelAtPeriodEnd:
            purchaseType === "subscription" ? cancelAtPeriodEnd : undefined,
        },
        checkoutConfig: Object.keys(checkoutConfig).length > 0 ? checkoutConfig : undefined,
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
