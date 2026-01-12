import { createHmac, randomBytes } from "crypto";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const outboundEventType = v.union(
  v.literal("membership.activated"),
  v.literal("membership.updated"),
  v.literal("membership.canceled"),
  v.literal("membership.expired"),
  v.literal("grant.created"),
  v.literal("grant.revoked"),
  v.literal("role_sync.succeeded"),
  v.literal("role_sync.failed")
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

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_BASE_DELAY_MS = 30 * 1000;
const DELIVERY_MAX_DELAY_MS = 15 * 60 * 1000;

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

const computeBackoffMs = (attempt: number) => {
  const multiplier = Math.max(0, attempt - 1);
  const delay = DELIVERY_BASE_DELAY_MS * Math.pow(2, multiplier);
  return Math.min(delay, DELIVERY_MAX_DELAY_MS);
};

const truncateError = (value: string, limit = 500) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
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

const normalizeEventTypes = (eventTypes?: string[]) => {
  const values = (eventTypes ?? allEventTypes)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unique = Array.from(new Set(values)).sort();
  if (unique.length === 0) {
    throw new Error("eventTypes cannot be empty.");
  }
  return unique;
};

const arraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const createSigningSecret = () => randomBytes(32).toString("base64url");

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
        q.eq("status", "pending").lte("nextAttemptAt", asOf)
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
        q.eq("guildId", args.guildId).eq("status", "failed")
      )
      .order("desc")
      .take(limit);

    return deliveries.map(
      ({
        endpointSigningSecret,
        payloadJson,
        ...delivery
      }: Doc<"outboundWebhookDeliveries">) => delivery
    );
  },
});

export const processOutboundWebhookDeliveries = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asOf = Date.now();
    const limit = coerceLimit(args.limit);
    const deliveryIds = await ctx.runQuery(
      internal.outboundWebhooks.listDueOutboundWebhookDeliveryIds,
      { asOf, limit }
    );

    const results: Array<{ deliveryId: string; status: string }> = [];

    for (const deliveryId of deliveryIds) {
      const delivery = await ctx.runMutation(
        internal.outboundWebhooks.startOutboundWebhookDelivery,
        {
          deliveryId,
          asOf,
        }
      );

      if (!delivery) {
        continue;
      }

      const timestamp = Date.now();
      const signedPayload = `${timestamp}.${delivery.payloadJson}`;
      const signature = createHmac(
        "sha256",
        delivery.endpointSigningSecret
      )
        .update(signedPayload, "utf8")
        .digest("hex");

      try {
        const response = await fetch(delivery.endpointUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-perkcord-event-type": delivery.eventType,
            "x-perkcord-signature": `t=${timestamp},v1=${signature}`,
          },
          body: delivery.payloadJson,
        });

        if (response.ok) {
          await ctx.runMutation(
            internal.outboundWebhooks.markOutboundWebhookDeliverySucceeded,
            { deliveryId, deliveredAt: Date.now() }
          );
          results.push({ deliveryId, status: "succeeded" });
          continue;
        }

        const message = `HTTP ${response.status}`;
        const attempts = delivery.attempts;
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          await ctx.runMutation(
            internal.outboundWebhooks.markOutboundWebhookDeliveryFailed,
            {
              deliveryId,
              status: "failed",
              lastError: truncateError(message),
            }
          );
          results.push({ deliveryId, status: "failed" });
          continue;
        }

        const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
        await ctx.runMutation(
          internal.outboundWebhooks.markOutboundWebhookDeliveryFailed,
          {
            deliveryId,
            status: "pending",
            nextAttemptAt,
            lastError: truncateError(message),
          }
        );
        results.push({ deliveryId, status: "pending" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error";
        const attempts = delivery.attempts;
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          await ctx.runMutation(
            internal.outboundWebhooks.markOutboundWebhookDeliveryFailed,
            {
              deliveryId,
              status: "failed",
              lastError: truncateError(message),
            }
          );
          results.push({ deliveryId, status: "failed" });
          continue;
        }

        const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
        await ctx.runMutation(
          internal.outboundWebhooks.markOutboundWebhookDeliveryFailed,
          {
            deliveryId,
            status: "pending",
            nextAttemptAt,
            lastError: truncateError(message),
          }
        );
        results.push({ deliveryId, status: "pending" });
      }
    }

    return {
      evaluatedAt: asOf,
      processedCount: results.length,
      results,
    };
  },
});
