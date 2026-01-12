import { randomBytes } from "crypto";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
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
