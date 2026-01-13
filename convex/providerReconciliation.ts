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

const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = ["active", "past_due"];

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
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return undefined;
};

const toOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const toRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const collectRecords = (payload: Record<string, unknown>) => {
  const records: Record<string, unknown>[] = [];
  const push = (value: unknown) => {
    const record = toRecord(value);
    if (record) {
      records.push(record);
    }
  };
  push(payload);
  if ("data" in payload) {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      for (const item of data) {
        push(item);
      }
    } else {
      push(data);
    }
  }
  push((payload as { subscription?: unknown }).subscription);
  push((payload as { recurring?: unknown }).recurring);
  push((payload as { customer?: unknown }).customer);
  return records;
};

const pickFromRecords = (records: Record<string, unknown>[], keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = toOptionalString(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const collectFromRecords = (records: Record<string, unknown>[], keys: string[]) => {
  const values = new Set<string>();
  for (const record of records) {
    for (const key of keys) {
      const raw = record[key];
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          const value = toOptionalString(entry);
          if (value) {
            values.add(value);
          }
        }
        continue;
      }
      const value = toOptionalString(raw);
      if (value) {
        values.add(value);
      }
    }
  }
  return values;
};

const normalizeStripeSubscriptionStatus = (
  status?: string,
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
  status?: string,
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

const normalizeNmiSubscriptionStatus = (
  status?: string,
): Doc<"providerEvents">["normalizedEventType"] | null => {
  if (!status) {
    return null;
  }
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("cancel") ||
    normalized.includes("terminated") ||
    normalized.includes("expired") ||
    normalized.includes("stopped")
  ) {
    return "SUBSCRIPTION_CANCELED";
  }
  if (
    normalized.includes("past_due") ||
    normalized.includes("pastdue") ||
    normalized.includes("failed") ||
    normalized.includes("declined") ||
    normalized.includes("suspended")
  ) {
    return "SUBSCRIPTION_PAST_DUE";
  }
  if (normalized.includes("active") || normalized.includes("approved")) {
    return "SUBSCRIPTION_ACTIVE";
  }
  return null;
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

const extractAuthorizeNetError = (payload: unknown) => {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const messages = record?.messages;
  if (messages && typeof messages === "object") {
    const messageList = (messages as Record<string, unknown>).message;
    if (Array.isArray(messageList) && messageList.length > 0) {
      const message = messageList[0];
      const text =
        message && typeof message === "object"
          ? (message as Record<string, unknown>).text
          : undefined;
      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
    }
  }
  return "Authorize.Net request failed.";
};

const getNmiApiUrl = () => {
  const override = process.env.NMI_API_URL?.trim();
  if (override) {
    return override;
  }
  return "https://secure.nmi.com/api/query.php";
};

const parseNmiXmlPayload = (value: string) => {
  const record: Record<string, unknown> = {};
  const pickTag = (tag: string) => {
    const match = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i").exec(value);
    return match?.[1];
  };
  const tags = [
    "status",
    "subscription_id",
    "next_billing_date",
    "next_charge_date",
    "current_period_end",
    "plan_id",
    "customer_vault_id",
    "customer_id",
  ];
  for (const tag of tags) {
    const found = pickTag(tag);
    if (found) {
      record[tag] = found;
    }
  }
  if (Object.keys(record).length > 0) {
    return record;
  }
  return { raw: value };
};

const parseNmiQueryPayload = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return { data: parsed } as Record<string, unknown>;
      }
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("<")) {
    return parseNmiXmlPayload(trimmed);
  }
  const params = new URLSearchParams(trimmed);
  if ([...params.keys()].length === 0) {
    return { raw: trimmed };
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of params.entries()) {
    record[key] = entry;
  }
  return record;
};

const extractNmiError = (records: Record<string, unknown>[]) => {
  const result = pickFromRecords(records, ["result", "response", "response_code", "success"]);
  const message = pickFromRecords(records, ["error", "error_message", "message", "result_text"]);
  if (result) {
    const normalized = result.trim().toLowerCase();
    if (["1", "success", "approved", "ok"].includes(normalized)) {
      return null;
    }
    return message ?? `NMI response result: ${result}.`;
  }
  return message ?? null;
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
      { limit },
    );

    const results: ReconcileResult[] = [];
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    const authorizeNetLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID?.trim();
    const authorizeNetTransactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY?.trim();

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

          const response = await fetch(`https://api.stripe.com/v1/subscriptions/${sourceRefId}`, {
            method: "GET",
            headers: {
              authorization: `Bearer ${stripeSecret}`,
            },
          });
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

          const status = typeof payload?.status === "string" ? payload.status : undefined;
          const normalizedEventType = normalizeStripeSubscriptionStatus(status);
          const periodEnd = toOptionalUnixMs(payload?.current_period_end);
          const customerId = getStripeCustomerId(payload?.customer);
          const items = payload?.items?.data;
          const priceIds = collectStripePriceIds(items);
          const eventKey = `reconcile:stripe:${sourceRefId}:${normalizedEventType}:${periodEnd ?? "none"}`;

          const recordResult = await ctx.runMutation(api.providerEvents.recordProviderEvent, {
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
          });

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
          const normalizedEventType = normalizeAuthorizeNetSubscriptionStatus(status);
          const eventKey = `reconcile:authorize_net:${sourceRefId}:${normalizedEventType}`;

          const recordResult = await ctx.runMutation(api.providerEvents.recordProviderEvent, {
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
          });

          results.push({
            grantId: grant._id,
            provider,
            status: recordResult.status,
            eventKey,
          });
          continue;
        }

        if (provider === "nmi") {
          const nmiSecurityKey =
            process.env.NMI_SECURITY_KEY?.trim() ?? process.env.NMI_API_KEY?.trim();
          if (!nmiSecurityKey) {
            results.push({
              grantId: grant._id,
              provider,
              status: "skipped",
              reason: "NMI security key not configured.",
            });
            continue;
          }

          const params = new URLSearchParams({
            security_key: nmiSecurityKey,
            subscription_id: sourceRefId,
            format: "json",
          });

          const response = await fetch(getNmiApiUrl(), {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });
          const rawText = await response.text();
          if (!response.ok) {
            results.push({
              grantId: grant._id,
              provider,
              status: "failed",
              reason: `NMI reconcile failed with status ${response.status}.`,
            });
            continue;
          }

          const payload = parseNmiQueryPayload(rawText);
          if (!payload) {
            results.push({
              grantId: grant._id,
              provider,
              status: "failed",
              reason: "NMI reconcile returned an empty payload.",
            });
            continue;
          }

          const records = collectRecords(payload);
          const payloadError = extractNmiError(records);
          const statusValue = pickFromRecords(records, [
            "status",
            "subscription_status",
            "recurring_status",
            "subscriptionStatus",
            "recurringStatus",
            "state",
          ]);
          const normalizedEventType = normalizeNmiSubscriptionStatus(statusValue);
          if (!normalizedEventType) {
            results.push({
              grantId: grant._id,
              provider,
              status: "failed",
              reason: payloadError ?? "NMI response missing status.",
            });
            continue;
          }

          const periodEnd = toOptionalUnixMs(
            pickFromRecords(records, [
              "period_end",
              "current_period_end",
              "next_billing_date",
              "nextBillingDate",
              "next_charge_date",
              "nextChargeDate",
              "end_date",
              "endDate",
              "expires_at",
              "expiresAt",
            ]),
          );
          const customerId = pickFromRecords(records, [
            "customer_vault_id",
            "customer_id",
            "customerId",
            "vault_id",
            "vaultId",
            "member_id",
            "memberId",
          ]);
          const priceIds = collectFromRecords(records, [
            "plan_id",
            "planId",
            "product_id",
            "productId",
            "item_id",
            "itemId",
            "price_id",
            "priceId",
            "sku",
            "tier_key",
            "tierKey",
          ]);
          const providerPriceIds = priceIds.size > 0 ? Array.from(priceIds) : undefined;
          const eventKey = `reconcile:nmi:${sourceRefId}:${normalizedEventType}:${periodEnd ?? "none"}`;

          const recordResult = await ctx.runMutation(api.providerEvents.recordProviderEvent, {
            provider: "nmi",
            providerEventId: eventKey,
            providerEventType: "subscription.reconciled",
            normalizedEventType,
            providerObjectId: sourceRefId,
            providerCustomerId: customerId,
            providerPriceIds,
            providerPeriodEnd: periodEnd,
            occurredAt: Date.now(),
            payloadSummaryJson: JSON.stringify({
              subscriptionId: sourceRefId,
              status: statusValue ?? null,
              periodEnd: periodEnd ?? null,
              customerId: customerId ?? null,
              planIds: providerPriceIds ?? null,
            }),
          });

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
        const message = error instanceof Error ? error.message : "Unexpected reconcile error.";
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
