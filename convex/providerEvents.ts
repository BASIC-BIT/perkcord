import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const providerName = v.union(
  v.literal("stripe"),
  v.literal("authorize_net"),
  v.literal("nmi")
);

const normalizedProviderEventType = v.union(
  v.literal("PAYMENT_SUCCEEDED"),
  v.literal("PAYMENT_FAILED"),
  v.literal("SUBSCRIPTION_ACTIVE"),
  v.literal("SUBSCRIPTION_PAST_DUE"),
  v.literal("SUBSCRIPTION_CANCELED"),
  v.literal("REFUND_ISSUED"),
  v.literal("CHARGEBACK_OPENED"),
  v.literal("CHARGEBACK_CLOSED")
);

const processedStatus = v.union(
  v.literal("processed"),
  v.literal("failed")
);

export const recordProviderEvent = mutation({
  args: {
    provider: providerName,
    providerEventId: v.string(),
    providerEventType: v.optional(v.string()),
    normalizedEventType: normalizedProviderEventType,
    providerObjectId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    payloadSummaryJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const providerEventId = args.providerEventId.trim();
    if (providerEventId.length === 0) {
      throw new Error("providerEventId cannot be empty.");
    }

    const existing = await ctx.db
      .query("providerEvents")
      .withIndex("by_provider_event", (q) =>
        q.eq("provider", args.provider).eq("providerEventId", providerEventId)
      )
      .unique();

    if (existing) {
      return {
        status: "duplicate" as const,
        providerEventId: existing._id,
      };
    }

    const providerEventType = args.providerEventType?.trim();
    const providerObjectId = args.providerObjectId?.trim();
    const providerCustomerId = args.providerCustomerId?.trim();

    const eventId = await ctx.db.insert("providerEvents", {
      provider: args.provider,
      providerEventId,
      providerEventType: providerEventType ? providerEventType : undefined,
      normalizedEventType: args.normalizedEventType,
      providerObjectId: providerObjectId ? providerObjectId : undefined,
      providerCustomerId: providerCustomerId ? providerCustomerId : undefined,
      occurredAt: args.occurredAt,
      receivedAt: now,
      payloadSummaryJson: args.payloadSummaryJson,
      createdAt: now,
      updatedAt: now,
    });

    return {
      status: "recorded" as const,
      providerEventId: eventId,
    };
  },
});

export const markProviderEventProcessed = mutation({
  args: {
    providerEventId: v.id("providerEvents"),
    status: processedStatus,
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const event = await ctx.db.get(args.providerEventId);
    if (!event) {
      throw new Error("Provider event not found.");
    }

    const lastError = args.lastError?.trim();
    if (args.status === "failed" && !lastError) {
      throw new Error("lastError is required when marking a provider event as failed.");
    }
    if (args.status === "processed" && lastError) {
      throw new Error("lastError is only allowed when status is failed.");
    }

    if (
      event.processedStatus === args.status &&
      event.lastError === (args.status === "failed" ? lastError : undefined)
    ) {
      return args.providerEventId;
    }

    const patch: Partial<Doc<"providerEvents">> = {
      processedStatus: args.status,
      processedAt: now,
      updatedAt: now,
      lastError: args.status === "failed" ? lastError : undefined,
    };

    await ctx.db.patch(args.providerEventId, patch);
    return args.providerEventId;
  },
});
