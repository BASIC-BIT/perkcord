import { query } from "./_generated/server";
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
    const subjectDiscordUserId =
      args.subjectDiscordUserId?.trim() ?? undefined;

    if (args.subjectDiscordUserId !== undefined && !subjectDiscordUserId) {
      throw new Error("subjectDiscordUserId cannot be empty.");
    }

    if (subjectDiscordUserId) {
      let queryBuilder = ctx.db
        .query("auditEvents")
        .withIndex("by_guild_user_time", (q) =>
          q
            .eq("guildId", args.guildId)
            .eq("subjectDiscordUserId", subjectDiscordUserId)
        );

      if (before !== undefined) {
        queryBuilder = queryBuilder.lt("timestamp", before);
      }

      return await queryBuilder.order("desc").take(limit);
    }

    let queryBuilder = ctx.db
      .query("auditEvents")
      .withIndex("by_guild_time", (q) => q.eq("guildId", args.guildId));

    if (before !== undefined) {
      queryBuilder = queryBuilder.lt("timestamp", before);
    }

    return await queryBuilder.order("desc").take(limit);
  },
});
