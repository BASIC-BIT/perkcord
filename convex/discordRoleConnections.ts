import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = ["active", "past_due"];

const isGrantEffective = (grant: Doc<"entitlementGrants">, now: number) => {
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

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));

export const getRoleConnectionState = query({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const discordUserId = args.discordUserId.trim();
    if (!discordUserId) {
      throw new Error("discordUserId is required for role connection sync.");
    }
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for role connection sync.");
    }

    const memberIdentity = await ctx.db
      .query("memberIdentities")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId),
      )
      .unique();

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId),
      )
      .collect();

    const now = Date.now();
    const activeGrants = grants.filter((grant) => isGrantEffective(grant, now));

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();
    tiers.sort((a, b) => a.name.localeCompare(b.name));
    const tierRank = new Map(tiers.map((tier, index) => [tier._id, index + 1]));

    let activeTier = 0;
    for (const grant of activeGrants) {
      const rank = tierRank.get(grant.tierId) ?? 0;
      if (rank > activeTier) {
        activeTier = rank;
      }
    }

    let earliestGrant: number | null = null;
    for (const grant of grants) {
      if (earliestGrant === null || grant.validFrom < earliestGrant) {
        earliestGrant = grant.validFrom;
      }
    }

    const memberSinceDays =
      earliestGrant === null ? 0 : Math.max(0, Math.floor((now - earliestGrant) / DAY_MS));

    return {
      memberIdentity,
      isActive: activeGrants.length > 0,
      tier: activeTier,
      memberSinceDays,
      evaluatedAt: now,
    };
  },
});

export const claimNextRoleConnectionUpdate = mutation({
  args: {
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error("Only system actors can claim role connection update requests.");
    }

    const [nextUpdate] = await ctx.db
      .query("roleConnectionUpdates")
      .withIndex("by_status_time", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(1);

    if (!nextUpdate) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(nextUpdate._id, {
      status: "in_progress",
      updatedAt: now,
    });

    return {
      ...nextUpdate,
      status: "in_progress" as Doc<"roleConnectionUpdates">["status"],
      updatedAt: now,
    };
  },
});

export const completeRoleConnectionUpdate = mutation({
  args: {
    updateId: v.id("roleConnectionUpdates"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    lastError: v.optional(v.string()),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error("Only system actors can complete role connection update requests.");
    }

    const update = await ctx.db.get(args.updateId);
    if (!update) {
      throw new Error("Role connection update not found.");
    }

    if (update.status === "completed" || update.status === "failed") {
      return args.updateId;
    }

    const status = args.status;
    const lastError = args.lastError?.trim();
    if (status === "failed" && !lastError) {
      throw new Error("lastError is required when marking update as failed.");
    }
    if (status === "completed" && lastError) {
      throw new Error("lastError is only allowed for failed updates.");
    }

    const now = Date.now();
    const patch: Partial<Doc<"roleConnectionUpdates">> = {
      status,
      updatedAt: now,
      completedAt: now,
    };
    if (status === "failed") {
      patch.lastError = lastError;
    } else {
      patch.lastError = undefined;
    }

    await ctx.db.patch(args.updateId, patch);
    return args.updateId;
  },
});
