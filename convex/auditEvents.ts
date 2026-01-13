import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ensureInteger = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
};

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  ensureInteger(limit, "limit");
  return Math.max(1, Math.min(limit, 100));
};

const coerceBefore = (before?: number) => {
  if (before === undefined) {
    return undefined;
  }
  ensureInteger(before, "before");
  return before;
};

const actorType = v.union(v.literal("system"), v.literal("admin"));

export const recordAuditEvent = mutation({
  args: {
    guildId: v.id("guilds"),
    actorType,
    actorId: v.optional(v.string()),
    subjectDiscordUserId: v.optional(v.string()),
    subjectTierId: v.optional(v.id("tiers")),
    subjectGrantId: v.optional(v.id("entitlementGrants")),
    eventType: v.string(),
    correlationId: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for audit event.");
    }

    const actorId = args.actorId?.trim();
    if (args.actorId !== undefined && !actorId) {
      throw new Error("actorId cannot be empty.");
    }

    const subjectDiscordUserId = args.subjectDiscordUserId?.trim();
    if (args.subjectDiscordUserId !== undefined && !subjectDiscordUserId) {
      throw new Error("subjectDiscordUserId cannot be empty.");
    }

    const timestamp = args.timestamp ?? Date.now();
    ensureInteger(timestamp, "timestamp");

    return await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp,
      actorType: args.actorType,
      actorId: actorId,
      subjectDiscordUserId,
      subjectTierId: args.subjectTierId,
      subjectGrantId: args.subjectGrantId,
      eventType: args.eventType,
      correlationId: args.correlationId,
      payloadJson: args.payloadJson,
    });
  },
});

export const listAuditEvents = query({
  args: {
    guildId: v.id("guilds"),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
    subjectDiscordUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const before = coerceBefore(args.before);
    const subjectDiscordUserId = args.subjectDiscordUserId?.trim() ?? undefined;

    if (args.subjectDiscordUserId !== undefined && !subjectDiscordUserId) {
      throw new Error("subjectDiscordUserId cannot be empty.");
    }

    if (subjectDiscordUserId) {
      const queryBuilder = ctx.db.query("auditEvents").withIndex("by_guild_user_time", (q) => {
        const builder = q
          .eq("guildId", args.guildId)
          .eq("subjectDiscordUserId", subjectDiscordUserId);
        return before !== undefined ? builder.lt("timestamp", before) : builder;
      });

      return await queryBuilder.order("desc").take(limit);
    }

    const queryBuilder = ctx.db.query("auditEvents").withIndex("by_guild_time", (q) => {
      const builder = q.eq("guildId", args.guildId);
      return before !== undefined ? builder.lt("timestamp", before) : builder;
    });

    return await queryBuilder.order("desc").take(limit);
  },
});
