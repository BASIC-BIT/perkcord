import { mutation } from "./_generated/server";
import { v } from "convex/values";

const entitlementStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("suspended_dispute")
);

export const createManualGrant = mutation({
  args: {
    guildId: v.id("guilds"),
    tierId: v.id("tiers"),
    discordUserId: v.string(),
    actorId: v.string(),
    status: v.optional(entitlementStatus),
    validFrom: v.optional(v.number()),
    validThrough: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = args.status ?? "active";
    const validFrom = args.validFrom ?? now;
    const validThrough = args.validThrough;

    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for manual grant.");
    }

    const tier = await ctx.db.get(args.tierId);
    if (!tier || tier.guildId !== args.guildId) {
      throw new Error("Tier not found for guild.");
    }

    if (validThrough !== undefined && validThrough < validFrom) {
      throw new Error("validThrough must be after validFrom.");
    }

    const grantId = await ctx.db.insert("entitlementGrants", {
      guildId: args.guildId,
      tierId: args.tierId,
      discordUserId: args.discordUserId,
      status,
      validFrom,
      validThrough,
      source: "manual",
      note: args.note,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: "admin",
      actorId: args.actorId,
      eventType: "grant.created",
      correlationId: grantId,
      payloadJson: JSON.stringify({
        grantId,
        tierId: args.tierId,
        discordUserId: args.discordUserId,
        status,
        validFrom,
        validThrough,
        source: "manual",
      }),
    });

    return grantId;
  },
});

export const revokeEntitlementGrant = mutation({
  args: {
    guildId: v.id("guilds"),
    grantId: v.id("entitlementGrants"),
    actorId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const grant = await ctx.db.get(args.grantId);
    if (!grant) {
      throw new Error("Entitlement grant not found.");
    }
    if (grant.guildId !== args.guildId) {
      throw new Error("Entitlement grant does not belong to guild.");
    }

    const nextStatus = grant.status === "canceled" ? grant.status : "canceled";
    const nextValidThrough =
      grant.validThrough === undefined || grant.validThrough > now
        ? now
        : grant.validThrough;

    const shouldPatch =
      nextStatus !== grant.status ||
      nextValidThrough !== grant.validThrough ||
      (args.note !== undefined && args.note !== grant.note);

    if (shouldPatch) {
      await ctx.db.patch(args.grantId, {
        status: nextStatus,
        validThrough: nextValidThrough,
        note: args.note ?? grant.note,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: "admin",
      actorId: args.actorId,
      eventType: "grant.revoked",
      correlationId: args.grantId,
      payloadJson: JSON.stringify({
        grantId: args.grantId,
        tierId: grant.tierId,
        discordUserId: grant.discordUserId,
        previousStatus: grant.status,
        status: nextStatus,
        previousValidThrough: grant.validThrough,
        validThrough: nextValidThrough,
        note: args.note,
      }),
    });

    return args.grantId;
  },
});
