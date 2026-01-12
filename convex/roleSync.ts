import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = [
  "active",
  "past_due",
];

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const isGrantEffective = (
  grant: Doc<"entitlementGrants">,
  now: number
) => {
  if (!activeGrantStatuses.includes(grant.status)) {
    return false;
  }
  if (grant.validFrom > now) {
    return false;
  }
  if (grant.validThrough !== undefined && grant.validThrough < now) {
    return false;
  }
  return true;
};

export const getDesiredRolesForMember = query({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for role sync.");
    }

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId)
      )
      .collect();

    const activeGrants = grants.filter((grant) => isGrantEffective(grant, now));
    if (activeGrants.length === 0) {
      return {
        discordUserId: args.discordUserId,
        desiredRoleIds: [],
        grantIds: [],
        evaluatedAt: now,
      };
    }

    const tierIds = Array.from(
      new Set(activeGrants.map((grant) => grant.tierId))
    );
    const tiers = await Promise.all(tierIds.map((tierId) => ctx.db.get(tierId)));

    const roleIdSet = new Set<string>();
    for (const tier of tiers) {
      if (tier && tier.guildId === args.guildId) {
        for (const roleId of tier.roleIds) {
          roleIdSet.add(roleId);
        }
      }
    }

    return {
      discordUserId: args.discordUserId,
      desiredRoleIds: Array.from(roleIdSet).sort(),
      grantIds: activeGrants.map((grant) => grant._id),
      evaluatedAt: now,
    };
  },
});

export const listRoleSyncRequests = query({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const discordUserId =
      args.discordUserId === undefined ? undefined : args.discordUserId.trim();
    if (discordUserId !== undefined && discordUserId.length === 0) {
      throw new Error("discordUserId cannot be empty.");
    }

    if (discordUserId) {
      return ctx.db
        .query("roleSyncRequests")
        .withIndex("by_guild_user_time", (q) =>
          q.eq("guildId", args.guildId).eq("discordUserId", discordUserId)
        )
        .order("desc")
        .take(limit);
    }

    return ctx.db
      .query("roleSyncRequests")
      .withIndex("by_guild_time", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(limit);
  },
});

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

export const claimNextRoleSyncRequest = mutation({
  args: {
    guildId: v.id("guilds"),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error("Only system actors can claim role sync requests.");
    }

    const [nextRequest] = await ctx.db
      .query("roleSyncRequests")
      .withIndex("by_guild_status", (q) =>
        q.eq("guildId", args.guildId).eq("status", "pending")
      )
      .order("asc")
      .take(1);

    if (!nextRequest) {
      return null;
    }

    await ctx.db.patch(nextRequest._id, {
      status: "in_progress",
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: requestActorType,
      actorId: args.actorId,
      subjectDiscordUserId: nextRequest.discordUserId,
      eventType: "role_sync.started",
      correlationId: nextRequest._id,
      payloadJson: JSON.stringify({
        requestId: nextRequest._id,
        scope: nextRequest.scope,
        discordUserId: nextRequest.discordUserId ?? null,
      }),
    });

    return {
      ...nextRequest,
      status: "in_progress" as Doc<"roleSyncRequests">["status"],
      updatedAt: now,
    };
  },
});

export const completeRoleSyncRequest = mutation({
  args: {
    requestId: v.id("roleSyncRequests"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    lastError: v.optional(v.string()),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error("Only system actors can complete role sync requests.");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Role sync request not found.");
    }

    if (request.status === "completed" || request.status === "failed") {
      return args.requestId;
    }

    const status = args.status;
    const lastError = args.lastError?.trim();
    if (status === "failed" && !lastError) {
      throw new Error("lastError is required when marking a role sync as failed.");
    }
    if (status === "completed" && lastError) {
      throw new Error("lastError is only allowed for failed role syncs.");
    }

    const patch: Partial<Doc<"roleSyncRequests">> = {
      status,
      updatedAt: now,
      completedAt: now,
    };
    if (status === "failed") {
      patch.lastError = lastError;
    }

    await ctx.db.patch(args.requestId, patch);

    await ctx.db.insert("auditEvents", {
      guildId: request.guildId,
      timestamp: now,
      actorType: requestActorType,
      actorId: args.actorId,
      subjectDiscordUserId: request.discordUserId,
      eventType: status === "failed" ? "role_sync.failed" : "role_sync.completed",
      correlationId: request._id,
      payloadJson: JSON.stringify({
        requestId: request._id,
        scope: request.scope,
        discordUserId: request.discordUserId ?? null,
        status,
        lastError: status === "failed" ? lastError : null,
      }),
    });

    return args.requestId;
  },
});
