import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type OutboundWebhookEventType = Doc<"outboundWebhookEndpoints">["eventTypes"][number];

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const outboundEventType = v.union(
  v.literal("membership.activated"),
  v.literal("membership.updated"),
  v.literal("membership.canceled"),
  v.literal("membership.expired"),
  v.literal("grant.created"),
  v.literal("grant.revoked"),
  v.literal("role_sync.succeeded"),
  v.literal("role_sync.failed"),
);

const allEventTypes: Doc<"outboundWebhookEndpoints">["eventTypes"] = [
  "membership.activated",
  "membership.updated",
  "membership.canceled",
  "membership.expired",
  "grant.created",
  "grant.revoked",
  "role_sync.succeeded",
  "role_sync.failed",
];

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const coerceAsOf = (value?: number) => {
  if (value === undefined) {
    return Date.now();
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("asOf must be a non-negative integer.");
  }
  return value;
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("url cannot be empty.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new Error("url must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("url must use http or https.");
  }
  return parsed.toString();
};

const normalizeEventTypes = (eventTypes?: string[]): OutboundWebhookEventType[] => {
  const values = (eventTypes ?? allEventTypes)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unique = Array.from(new Set(values)).sort();
  if (unique.length === 0) {
    throw new Error("eventTypes cannot be empty.");
  }
  return unique as OutboundWebhookEventType[];
};

const arraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const createSigningSecret = () => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("crypto.getRandomValues is not available for webhook signing secrets.");
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const createOutboundWebhookEndpoint = mutation({
  args: {
    guildId: v.id("guilds"),
    url: v.string(),
    eventTypes: v.optional(v.array(outboundEventType)),
    isActive: v.optional(v.boolean()),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for webhook endpoint.");
    }

    const url = normalizeUrl(args.url);
    const eventTypes = normalizeEventTypes(args.eventTypes);
    const signingSecret = createSigningSecret();
    const isActive = args.isActive ?? true;

    const endpointId = await ctx.db.insert("outboundWebhookEndpoints", {
      guildId: args.guildId,
      url,
      eventTypes,
      signingSecret,
      isActive,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: args.actorType ?? "admin",
      actorId: args.actorId,
      eventType: "webhook_endpoint.created",
      correlationId: endpointId,
      payloadJson: JSON.stringify({
        endpointId,
        url,
        eventTypes,
        isActive,
      }),
    });

    return {
      endpointId,
      signingSecret,
    };
  },
});

export const updateOutboundWebhookEndpoint = mutation({
  args: {
    guildId: v.id("guilds"),
    endpointId: v.id("outboundWebhookEndpoints"),
    url: v.optional(v.string()),
    eventTypes: v.optional(v.array(outboundEventType)),
    isActive: v.optional(v.boolean()),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const endpoint = await ctx.db.get(args.endpointId);
    if (!endpoint) {
      throw new Error("Webhook endpoint not found.");
    }
    if (endpoint.guildId !== args.guildId) {
      throw new Error("Webhook endpoint does not belong to guild.");
    }

    const patch: Partial<Doc<"outboundWebhookEndpoints">> = {};
    const updatedFields: string[] = [];

    if (args.url !== undefined) {
      const url = normalizeUrl(args.url);
      if (url !== endpoint.url) {
        patch.url = url;
        updatedFields.push("url");
      }
    }

    if (args.eventTypes !== undefined) {
      const eventTypes = normalizeEventTypes(args.eventTypes);
      if (!arraysEqual(eventTypes, endpoint.eventTypes)) {
        patch.eventTypes = eventTypes;
        updatedFields.push("eventTypes");
      }
    }

    if (args.isActive !== undefined && args.isActive !== endpoint.isActive) {
      patch.isActive = args.isActive;
      updatedFields.push("isActive");
    }

    if (updatedFields.length === 0) {
      return args.endpointId;
    }

    patch.updatedAt = now;
    await ctx.db.patch(args.endpointId, patch);

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: args.actorType ?? "admin",
      actorId: args.actorId,
      eventType: "webhook_endpoint.updated",
      correlationId: args.endpointId,
      payloadJson: JSON.stringify({
        endpointId: args.endpointId,
        updatedFields,
      }),
    });

    return args.endpointId;
  },
});

export const listOutboundWebhookEndpoints = query({
  args: {
    guildId: v.id("guilds"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const endpoints = await ctx.db
      .query("outboundWebhookEndpoints")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();

    const filtered = args.activeOnly
      ? endpoints.filter((endpoint) => endpoint.isActive)
      : endpoints;

    return filtered.map(({ signingSecret, ...endpoint }) => ({
      ...endpoint,
      hasSigningSecret: Boolean(signingSecret),
    }));
  },
});

export const listDueOutboundWebhookDeliveryIds = internalQuery({
  args: {
    asOf: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asOf = coerceAsOf(args.asOf);
    const limit = coerceLimit(args.limit);

    const deliveries = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_status_nextAttempt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", asOf),
      )
      .order("asc")
      .take(limit);

    return deliveries.map((delivery) => delivery._id);
  },
});

export const startOutboundWebhookDelivery = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    asOf: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = coerceAsOf(args.asOf);
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) {
      return null;
    }
    if (delivery.status !== "pending") {
      return null;
    }
    if (delivery.nextAttemptAt > now) {
      return null;
    }

    const attempts = delivery.attempts + 1;
    await ctx.db.patch(args.deliveryId, {
      status: "delivering",
      attempts,
      lastAttemptedAt: now,
      updatedAt: now,
    });

    return {
      deliveryId: args.deliveryId,
      attempts,
      endpointUrl: delivery.endpointUrl,
      endpointSigningSecret: delivery.endpointSigningSecret,
      payloadJson: delivery.payloadJson,
      eventType: delivery.eventType,
    };
  },
});

export const markOutboundWebhookDeliverySucceeded = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    deliveredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = coerceAsOf(args.deliveredAt);
    await ctx.db.patch(args.deliveryId, {
      status: "succeeded",
      deliveredAt: now,
      updatedAt: now,
      lastError: undefined,
    });
    return args.deliveryId;
  },
});

export const markOutboundWebhookDeliveryFailed = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    status: v.union(v.literal("pending"), v.literal("failed")),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.status === "pending" && args.nextAttemptAt === undefined) {
      throw new Error("nextAttemptAt is required when retrying deliveries.");
    }

    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      nextAttemptAt: args.nextAttemptAt ?? now,
      lastError: args.lastError,
      updatedAt: now,
    });
    return args.deliveryId;
  },
});

export const listFailedOutboundWebhookDeliveries = query({
  args: {
    guildId: v.id("guilds"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const deliveries = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_guild_status_time", (q) =>
        q.eq("guildId", args.guildId).eq("status", "failed"),
      )
      .order("desc")
      .take(limit);

    return deliveries.map((delivery: Doc<"outboundWebhookDeliveries">) => {
      const { endpointSigningSecret, payloadJson, ...rest } = delivery;
      void endpointSigningSecret;
      void payloadJson;
      return rest;
    });
  },
});
