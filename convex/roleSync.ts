import { mutation } from "./_generated/server";
import { v } from "convex/values";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));

export const requestRoleSync = mutation({
  args: {
    guildId: v.id("guilds"),
    scope: v.union(v.literal("guild"), v.literal("user")),
    discordUserId: v.optional(v.string()),
    actorId: v.string(),
    actorType,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestActorType = args.actorType ?? "admin";
    if (requestActorType !== "admin") {
      throw new Error("Only admins can request a role sync.");
    }

    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for role sync request.");
    }

    let discordUserId: string | undefined;
    if (args.scope === "user") {
      discordUserId = args.discordUserId?.trim();
      if (!discordUserId) {
        throw new Error("discordUserId is required for user scope.");
      }
    } else if (args.discordUserId) {
      throw new Error("discordUserId is only allowed for user scope.");
    }

    const requestId = await ctx.db.insert("roleSyncRequests", {
      guildId: args.guildId,
      scope: args.scope,
      discordUserId,
      status: "pending",
      requestedAt: now,
      requestedByActorType: requestActorType,
      requestedByActorId: args.actorId,
      reason: args.reason,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: requestActorType,
      actorId: args.actorId,
      subjectDiscordUserId: discordUserId,
      eventType: "role_sync.requested",
      correlationId: requestId,
      payloadJson: JSON.stringify({
        requestId,
        scope: args.scope,
        discordUserId,
        reason: args.reason ?? null,
      }),
    });

    return requestId;
  },
});
