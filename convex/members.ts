import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const oauthPayload = v.object({
  accessTokenEnc: v.string(),
  refreshTokenEnc: v.string(),
  expiresAt: v.number(),
});

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 25;
  }
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const normalizeSearch = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isLikelyDiscordId = (value: string) => /^\d{15,20}$/.test(value);

export const upsertMemberIdentity = mutation({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
    oauth: v.optional(oauthPayload),
    actorId: v.optional(v.string()),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const discordUserId = args.discordUserId.trim();
    if (discordUserId.length === 0) {
      throw new Error("Discord user id cannot be empty.");
    }
    const discordUsername =
      args.discordUsername === undefined ? undefined : args.discordUsername.trim();
    if (discordUsername !== undefined && discordUsername.length === 0) {
      throw new Error("Discord username cannot be empty.");
    }

    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for member identity.");
    }

    const existing = await ctx.db
      .query("memberIdentities")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId)
      )
      .unique();

    if (!existing) {
      const memberIdentityId = await ctx.db.insert("memberIdentities", {
        guildId: args.guildId,
        discordUserId,
        discordUsername,
        oauth: args.oauth,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("auditEvents", {
        guildId: args.guildId,
        timestamp: now,
        actorType: args.actorType ?? "system",
        actorId: args.actorId,
        subjectDiscordUserId: discordUserId,
        eventType: "member_identity.linked",
        correlationId: memberIdentityId,
        payloadJson: JSON.stringify({
          memberIdentityId,
          discordUserId,
          discordUsername,
          oauthLinked: Boolean(args.oauth),
        }),
      });

      return memberIdentityId;
    }

    const patch: Partial<Doc<"memberIdentities">> = {};
    const updatedFields: string[] = [];

    if (discordUsername !== undefined && discordUsername !== existing.discordUsername) {
      patch.discordUsername = discordUsername;
      updatedFields.push("discordUsername");
    }

    if (args.oauth) {
      const existingOauth = existing.oauth;
      const oauthChanged =
        !existingOauth ||
        existingOauth.accessTokenEnc !== args.oauth.accessTokenEnc ||
        existingOauth.refreshTokenEnc !== args.oauth.refreshTokenEnc ||
        existingOauth.expiresAt !== args.oauth.expiresAt;
      if (oauthChanged) {
        patch.oauth = args.oauth;
        updatedFields.push("oauth");
      }
    }

    if (updatedFields.length === 0) {
      return existing._id;
    }

    patch.updatedAt = now;
    await ctx.db.patch(existing._id, patch);

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: args.actorType ?? "system",
      actorId: args.actorId,
      subjectDiscordUserId: discordUserId,
      eventType: "member_identity.updated",
      correlationId: existing._id,
      payloadJson: JSON.stringify({
        memberIdentityId: existing._id,
        discordUserId,
        updatedFields,
      }),
    });

    return existing._id;
  },
});

export const searchMembers = query({
  args: {
    guildId: v.id("guilds"),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const search = normalizeSearch(args.search);
    const limit = coerceLimit(args.limit);

    if (search && isLikelyDiscordId(search)) {
      const match = await ctx.db
        .query("memberIdentities")
        .withIndex("by_guild_user", (q) =>
          q.eq("guildId", args.guildId).eq("discordUserId", search)
        )
        .unique();

      return match ? [match] : [];
    }

    const members = await ctx.db
      .query("memberIdentities")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();

    members.sort((a, b) => b.updatedAt - a.updatedAt);

    if (!search) {
      return members.slice(0, limit);
    }

    const normalized = search.toLowerCase();
    const results: Doc<"memberIdentities">[] = [];

    for (const member of members) {
      if (results.length >= limit) {
        break;
      }
      if (member.discordUserId.includes(normalized)) {
        results.push(member);
        continue;
      }
      const username = member.discordUsername?.toLowerCase();
      if (username && username.includes(normalized)) {
        results.push(member);
      }
    }

    return results;
  },
});
