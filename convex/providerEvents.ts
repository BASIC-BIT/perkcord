import { mutation, query } from "./_generated/server";
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

const normalizeOptionalStringArray = (values?: string[]) => {
  if (!values) {
    return undefined;
  }
  const trimmed = values.map((value) => value.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return undefined;
  }
  return Array.from(new Set(trimmed));
};

const coerceScanLimit = (limit?: number) => {
  if (limit === undefined) {
    return 200;
  }
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error("scanLimit must be a positive integer.");
  }
  return Math.min(limit, 1000);
};

const addIdValues = (target: Set<string>, values?: string[]) => {
  if (!values) {
    return;
  }
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      target.add(trimmed);
    }
  }
};

const hasAnyOverlap = (values: string[] | undefined, candidates: Set<string>) =>
  values ? values.some((value) => candidates.has(value)) : false;

export const recordProviderEvent = mutation({
  args: {
    provider: providerName,
    providerEventId: v.string(),
    providerEventType: v.optional(v.string()),
    normalizedEventType: normalizedProviderEventType,
    providerObjectId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    providerPriceIds: v.optional(v.array(v.string())),
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
    const providerPriceIds = normalizeOptionalStringArray(args.providerPriceIds);

    const eventId = await ctx.db.insert("providerEvents", {
      provider: args.provider,
      providerEventId,
      providerEventType: providerEventType ? providerEventType : undefined,
      normalizedEventType: args.normalizedEventType,
      providerObjectId: providerObjectId ? providerObjectId : undefined,
      providerCustomerId: providerCustomerId ? providerCustomerId : undefined,
      providerPriceIds,
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

export const getLatestProviderEventsForGuild = query({
  args: {
    guildId: v.id("guilds"),
    scanLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scanLimit = coerceScanLimit(args.scanLimit);
    const now = Date.now();

    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for provider event lookup.");
    }

    const customerLinks = await ctx.db
      .query("providerCustomerLinks")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();

    const customerIdsByProvider = new Map<
      Doc<"providerEvents">["provider"],
      Set<string>
    >();
    for (const link of customerLinks) {
      let set = customerIdsByProvider.get(link.provider);
      if (!set) {
        set = new Set<string>();
        customerIdsByProvider.set(link.provider, set);
      }
      set.add(link.providerCustomerId);
    }

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();

    const priceIdsByProvider = new Map<
      Doc<"providerEvents">["provider"],
      Set<string>
    >();

    for (const tier of tiers) {
      const refs = tier.providerRefs;
      if (!refs) {
        continue;
      }

      if (refs.stripeSubscriptionPriceIds || refs.stripeOneTimePriceIds) {
        let set = priceIdsByProvider.get("stripe");
        if (!set) {
          set = new Set<string>();
          priceIdsByProvider.set("stripe", set);
        }
        addIdValues(set, refs.stripeSubscriptionPriceIds);
        addIdValues(set, refs.stripeOneTimePriceIds);
      }

      if (refs.authorizeNetSubscriptionIds || refs.authorizeNetOneTimeKeys) {
        let set = priceIdsByProvider.get("authorize_net");
        if (!set) {
          set = new Set<string>();
          priceIdsByProvider.set("authorize_net", set);
        }
        addIdValues(set, refs.authorizeNetSubscriptionIds);
        addIdValues(set, refs.authorizeNetOneTimeKeys);
      }

      if (refs.nmiPlanIds || refs.nmiOneTimeKeys) {
        let set = priceIdsByProvider.get("nmi");
        if (!set) {
          set = new Set<string>();
          priceIdsByProvider.set("nmi", set);
        }
        addIdValues(set, refs.nmiPlanIds);
        addIdValues(set, refs.nmiOneTimeKeys);
      }
    }

    const providers: Doc<"providerEvents">["provider"][] = [
      "stripe",
      "authorize_net",
      "nmi",
    ];

    const latestByProvider = [];
    for (const provider of providers) {
      const customerIds = customerIdsByProvider.get(provider) ?? new Set();
      const priceIds = priceIdsByProvider.get(provider) ?? new Set();
      if (customerIds.size === 0 && priceIds.size === 0) {
        latestByProvider.push({
          provider,
          event: null,
          matchType: "none",
        });
        continue;
      }

      const recentEvents = await ctx.db
        .query("providerEvents")
        .withIndex("by_provider_time", (q) => q.eq("provider", provider))
        .order("desc")
        .take(scanLimit);

      let matchedEvent: Doc<"providerEvents"> | null = null;
      let matchType: "customer" | "price" | "none" = "none";

      for (const event of recentEvents) {
        if (event.providerCustomerId && customerIds.has(event.providerCustomerId)) {
          matchedEvent = event;
          matchType = "customer";
          break;
        }
        if (hasAnyOverlap(event.providerPriceIds, priceIds)) {
          matchedEvent = event;
          matchType = "price";
          break;
        }
      }

      latestByProvider.push({
        provider,
        event: matchedEvent,
        matchType,
      });
    }

    return {
      guildId: args.guildId,
      scanLimit,
      evaluatedAt: now,
      providers: latestByProvider,
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
