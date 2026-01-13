import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

export const upsertGuild = mutation({
  args: {
    discordGuildId: v.string(),
    name: v.string(),
    actorId: v.optional(v.string()),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Guild name cannot be empty.");
    }

    const existing = await ctx.db
      .query("guilds")
      .withIndex("by_discord_id", (q) => q.eq("discordGuildId", args.discordGuildId))
      .unique();

    if (!existing) {
      const guildId = await ctx.db.insert("guilds", {
        discordGuildId: args.discordGuildId,
        name,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("auditEvents", {
        guildId,
        timestamp: now,
        actorType: args.actorType ?? "system",
        actorId: args.actorId,
        eventType: "guild.created",
        correlationId: guildId,
        payloadJson: JSON.stringify({
          guildId,
          discordGuildId: args.discordGuildId,
          name,
        }),
      });

      return guildId;
    }

    if (existing.name === name) {
      return existing._id;
    }

    await ctx.db.patch(existing._id, {
      name,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: existing._id,
      timestamp: now,
      actorType: args.actorType ?? "system",
      actorId: args.actorId,
      eventType: "guild.updated",
      correlationId: existing._id,
      payloadJson: JSON.stringify({
        guildId: existing._id,
        discordGuildId: args.discordGuildId,
        name,
      }),
    });

    return existing._id;
  },
});

export const getGuildByDiscordId = query({
  args: {
    discordGuildId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guilds")
      .withIndex("by_discord_id", (q) => q.eq("discordGuildId", args.discordGuildId))
      .unique();
  },
});

export const listGuilds = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const guilds = await ctx.db.query("guilds").collect();
    guilds.sort((a, b) => a.name.localeCompare(b.name));
    return guilds.slice(0, limit);
  },
});
