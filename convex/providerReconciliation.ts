import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

type SubscriptionGrantSummary = {
  _id: Doc<"entitlementGrants">["_id"];
  source: Doc<"entitlementGrants">["source"];
  sourceRefId?: string;
};

type ReconcileResult = {
  grantId: string;
  provider: Doc<"providerEvents">["provider"];
  status: "recorded" | "duplicate" | "skipped" | "failed";
  eventKey?: string;
  reason?: string;
};

const subscriptionSources = new Map<
  Doc<"entitlementGrants">["source"],
  Doc<"providerEvents">["provider"]
>([
  ["stripe_subscription", "stripe"],
  ["authorize_net_subscription", "authorize_net"],
  ["nmi_subscription", "nmi"],
]);

const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = [
  "active",
  "past_due",
];

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 25;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const toOptionalUnixMs = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed < 1e12 ? parsed * 1000 : parsed;
    }
  }
  return undefined;
};

const normalizeStripeSubscriptionStatus = (
  status?: string
): Doc<"providerEvents">["normalizedEventType"] => {
  switch (status) {
    case "past_due":
    case "unpaid":
      return "SUBSCRIPTION_PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "SUBSCRIPTION_CANCELED";
    case "trialing":
    case "active":
    case "incomplete":
    default:
      return "SUBSCRIPTION_ACTIVE";
  }
};

const normalizeAuthorizeNetSubscriptionStatus = (
  status?: string
): Doc<"providerEvents">["normalizedEventType"] => {
  const normalized = status?.trim().toLowerCase();
  switch (normalized) {
    case "suspended":
    case "past_due":
    case "pastdue":
      return "SUBSCRIPTION_PAST_DUE";
    case "canceled":
    case "cancelled":
    case "terminated":
    case "expired":
      return "SUBSCRIPTION_CANCELED";
    case "active":
    default:
      return "SUBSCRIPTION_ACTIVE";
  }
};

const getStripeCustomerId = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") {
      return id;
    }
  }
  return undefined;
};

const collectStripePriceIds = (items: unknown) => {
  if (!Array.isArray(items)) {
    return [] as string[];
  }
  const priceIds = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const price = (item as { price?: { id?: unknown } }).price;
    if (price && typeof price.id === "string") {
      priceIds.add(price.id);
    }
  }
  return Array.from(priceIds);
};

const getAuthorizeNetApiUrl = () => {
  const override = process.env.AUTHORIZE_NET_API_URL?.trim();
  if (override) {
    return override;
  }
  const env = process.env.AUTHORIZE_NET_ENV?.trim().toLowerCase();
  if (env === "production" || env === "prod") {
    return "https://api.authorize.net/xml/v1/request.api";
  }
  return "https://apitest.authorize.net/xml/v1/request.api";
};

const extractAuthorizeNetError = (payload: any) => {
  const messageText = payload?.messages?.message?.[0]?.text;
  if (typeof messageText === "string" && messageText.trim().length > 0) {
    return messageText.trim();
  }
  return "Authorize.Net request failed.";
};

export const listSubscriptionGrantsForReconciliation = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const results: SubscriptionGrantSummary[] = [];

    for (const status of activeGrantStatuses) {
      if (results.length >= limit) {
        break;
      }
      const candidates = await ctx.db
        .query("entitlementGrants")
        .withIndex("by_status_validThrough", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);

      for (const grant of candidates) {
        if (results.length >= limit) {
          break;
        }
        if (!subscriptionSources.has(grant.source)) {
          continue;
        }
        results.push({
          _id: grant._id,
          source: grant.source,
          sourceRefId: grant.sourceRefId,
        });
      }
    }

    return results;
  },
});

export const reconcileProviderSubscriptions = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const grants = await ctx.runQuery(
      internal.providerReconciliation.listSubscriptionGrantsForReconciliation,
      { limit }
    );

    const results: ReconcileResult[] = [];
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    const authorizeNetLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID?.trim();
    const authorizeNetTransactionKey =
      process.env.AUTHORIZE_NET_TRANSACTION_KEY?.trim();

    for (const grant of grants) {
      const provider = subscriptionSources.get(grant.source);
      if (!provider) {
        continue;
      }
      const sourceRefId = grant.sourceRefId?.trim();
      if (!sourceRefId) {
        results.push({
          grantId: grant._id,
          provider,
          status: "skipped",
          reason: "Missing sourceRefId.",
        });
        continue;
      }

      try {
        if (provider === "stripe") {
          if (!stripeSecret) {
            results.push({
              grantId: grant._id,
              provider,
              status: "skipped",
              reason: "STRIPE_SECRET_KEY not configured.",
            });
            continue;
          }
          if (!sourceRefId.startsWith("sub_")) {
            results.push({
              grantId: grant._id,
              provider,
              status: "skipped",
              reason: "Stripe sourceRefId is not a subscription id.",
            });
            continue;
          }

          const response = await fetch(
            `https://api.stripe.com/v1/subscriptions/${sourceRefId}`,
            {
              method: "GET",
              headers: {
                authorization: `Bearer ${stripeSecret}`,
              },
            }
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const message =
              typeof payload?.error?.message === "string"
                ? payload.error.message
                : `Stripe reconcile failed with status ${response.status}.`;
            results.push({
              grantId: grant._id,
              provider,
              status: "failed",
              reason: message,
            });
            continue;
          }

          const status =
            typeof payload?.status === "string" ? payload.status : undefined;
          const normalizedEventType = normalizeStripeSubscriptionStatus(status);
          const periodEnd = toOptionalUnixMs(payload?.current_period_end);
          const customerId = getStripeCustomerId(payload?.customer);
          const items = payload?.items?.data;
          const priceIds = collectStripePriceIds(items);
          const eventKey = `reconcile:stripe:${sourceRefId}:${normalizedEventType}:${periodEnd ?? "none"}`;

          const recordResult = await ctx.runMutation(
            api.providerEvents.recordProviderEvent,
            {
              provider: "stripe",
              providerEventId: eventKey,
              providerEventType: "subscription.reconciled",
              normalizedEventType,
              providerObjectId: sourceRefId,
              providerCustomerId: customerId,
              providerPriceIds: priceIds.length > 0 ? priceIds : undefined,
              providerPeriodEnd: periodEnd,
              occurredAt: Date.now(),
              payloadSummaryJson: JSON.stringify({
                subscriptionId: sourceRefId,
                status: status ?? null,
                periodEnd: periodEnd ?? null,
                customerId: customerId ?? null,
              }),
            }
          );

          results.push({
            grantId: grant._id,
            provider,
            status: recordResult.status,
            eventKey,
          });
          continue;
        }

        if (provider === "authorize_net") {
          if (!authorizeNetLoginId || !authorizeNetTransactionKey) {
            results.push({
              grantId: grant._id,
              provider,
              status: "skipped",
              reason: "Authorize.Net credentials not configured.",
            });
            continue;
          }

          const response = await fetch(getAuthorizeNetApiUrl(), {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              getSubscriptionStatusRequest: {
                merchantAuthentication: {
                  name: authorizeNetLoginId,
                  transactionKey: authorizeNetTransactionKey,
                },
                subscriptionId: sourceRefId,
              },
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.messages?.resultCode !== "Ok") {
            const message = extractAuthorizeNetError(payload);
            results.push({
              grantId: grant._id,
              provider,
              status: "failed",
              reason: message,
            });
            continue;
          }

          const status =
            typeof payload?.subscriptionStatus === "string"
              ? payload.subscriptionStatus
              : undefined;
          const normalizedEventType =
            normalizeAuthorizeNetSubscriptionStatus(status);
          const eventKey = `reconcile:authorize_net:${sourceRefId}:${normalizedEventType}`;

          const recordResult = await ctx.runMutation(
            api.providerEvents.recordProviderEvent,
            {
              provider: "authorize_net",
              providerEventId: eventKey,
              providerEventType: "subscription.reconciled",
              normalizedEventType,
              providerObjectId: sourceRefId,
              occurredAt: Date.now(),
              payloadSummaryJson: JSON.stringify({
                subscriptionId: sourceRefId,
                status: status ?? null,
              }),
            }
          );

          results.push({
            grantId: grant._id,
            provider,
            status: recordResult.status,
            eventKey,
          });
          continue;
        }

        results.push({
          grantId: grant._id,
          provider,
          status: "skipped",
          reason: "Provider reconciliation not implemented.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected reconcile error.";
        results.push({
          grantId: grant._id,
          provider,
          status: "failed",
          reason: message,
        });
      }
    }

    return {
      evaluatedAt: Date.now(),
      processedCount: results.filter((item) => item.status === "recorded").length,
      skippedCount: results.filter((item) => item.status === "skipped").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  },
});
