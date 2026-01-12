import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  createOutboundWebhookPayload,
  enqueueOutboundWebhookDeliveries,
} from "./outboundWebhookQueue";
import { enqueueRoleConnectionUpdate } from "./roleConnectionQueue";

const entitlementStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("suspended_dispute")
);
const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = [
  "active",
  "past_due",
];

const entitlementPolicy = v.object({
  kind: v.union(v.literal("subscription"), v.literal("one_time")),
  durationDays: v.optional(v.number()),
  isLifetime: v.optional(v.boolean()),
  gracePeriodDays: v.optional(v.number()),
  cancelAtPeriodEnd: v.optional(v.boolean()),
});

const providerRefs = v.optional(
  v.object({
    stripeSubscriptionPriceIds: v.optional(v.array(v.string())),
    stripeOneTimePriceIds: v.optional(v.array(v.string())),
    authorizeNetSubscriptionIds: v.optional(v.array(v.string())),
    authorizeNetOneTimeKeys: v.optional(v.array(v.string())),
    nmiPlanIds: v.optional(v.array(v.string())),
    nmiOneTimeKeys: v.optional(v.array(v.string())),
  })
);

type EntitlementPolicy = {
  kind: "subscription" | "one_time";
  durationDays?: number;
  isLifetime?: boolean;
  gracePeriodDays?: number;
  cancelAtPeriodEnd?: boolean;
};

type ProviderRefs = {
  stripeSubscriptionPriceIds?: string[];
  stripeOneTimePriceIds?: string[];
  authorizeNetSubscriptionIds?: string[];
  authorizeNetOneTimeKeys?: string[];
  nmiPlanIds?: string[];
  nmiOneTimeKeys?: string[];
};

const normalizeRoleIds = (roleIds: string[]) => Array.from(new Set(roleIds));

const assertPositiveInteger = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
};

const assertNonNegativeInteger = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
};

const validateEntitlementPolicy = (policy: EntitlementPolicy) => {
  if (policy.durationDays !== undefined) {
    assertPositiveInteger(policy.durationDays, "durationDays");
  }
  if (policy.gracePeriodDays !== undefined) {
    assertNonNegativeInteger(policy.gracePeriodDays, "gracePeriodDays");
  }
  if (policy.kind === "subscription") {
    if (policy.isLifetime) {
      throw new Error("Subscriptions cannot be marked as lifetime.");
    }
    if (policy.durationDays !== undefined) {
      throw new Error("Subscriptions do not support durationDays.");
    }
  }
  if (policy.kind === "one_time") {
    const hasDuration = policy.durationDays !== undefined;
    const isLifetime = Boolean(policy.isLifetime);
    if (hasDuration === isLifetime) {
      throw new Error(
        "One-time entitlements require either durationDays or isLifetime=true (but not both)."
      );
    }
  }
};

const validateRoleIds = (roleIds: string[]) => {
  if (roleIds.length === 0) {
    throw new Error("Tier must map to at least one role.");
  }
};

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

const coerceExpirationLimit = (limit?: number) => {
  if (limit === undefined) {
    return 200;
  }
  assertPositiveInteger(limit, "limit");
  return Math.min(limit, 1000);
};

const coerceExpirationTime = (value?: number) => {
  if (value === undefined) {
    return Date.now();
  }
  assertNonNegativeInteger(value, "asOf");
  return value;
};

export const createTier = mutation({
  args: {
    guildId: v.id("guilds"),
    name: v.string(),
    description: v.optional(v.string()),
    roleIds: v.array(v.string()),
    entitlementPolicy,
    providerRefs,
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for tier.");
    }

    const roleIds = normalizeRoleIds(args.roleIds);
    validateRoleIds(roleIds);
    validateEntitlementPolicy(args.entitlementPolicy);

    const tierId = await ctx.db.insert("tiers", {
      guildId: args.guildId,
      name: args.name,
      description: args.description,
      roleIds,
      entitlementPolicy: args.entitlementPolicy,
      providerRefs: args.providerRefs as ProviderRefs | undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: "admin",
      actorId: args.actorId,
      subjectTierId: tierId,
      eventType: "tier.created",
      correlationId: tierId,
      payloadJson: JSON.stringify({
        tierId,
        name: args.name,
        roleIds,
      }),
    });

    return tierId;
  },
});

export const updateTier = mutation({
  args: {
    guildId: v.id("guilds"),
    tierId: v.id("tiers"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    roleIds: v.optional(v.array(v.string())),
    entitlementPolicy: v.optional(entitlementPolicy),
    providerRefs: providerRefs,
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const tier = await ctx.db.get(args.tierId);
    if (!tier) {
      throw new Error("Tier not found.");
    }
    if (tier.guildId !== args.guildId) {
      throw new Error("Tier does not belong to guild.");
    }

    const nextRoleIds = args.roleIds
      ? normalizeRoleIds(args.roleIds)
      : tier.roleIds;
    if (args.roleIds) {
      validateRoleIds(nextRoleIds);
    }

    const nextPolicy = args.entitlementPolicy ?? tier.entitlementPolicy;
    validateEntitlementPolicy(nextPolicy as EntitlementPolicy);

    const patch: Partial<Doc<"tiers">> = {};
    if (args.name !== undefined && args.name !== tier.name) {
      patch.name = args.name;
    }
    if (args.description !== undefined && args.description !== tier.description) {
      patch.description = args.description;
    }
    if (args.roleIds && nextRoleIds !== tier.roleIds) {
      patch.roleIds = nextRoleIds;
    }
    if (args.entitlementPolicy) {
      patch.entitlementPolicy = nextPolicy;
    }
    if (args.providerRefs !== undefined) {
      patch.providerRefs = args.providerRefs as ProviderRefs | undefined;
    }

    if (Object.keys(patch).length === 0) {
      return args.tierId;
    }

    patch.updatedAt = now;
    await ctx.db.patch(args.tierId, patch);

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: "admin",
      actorId: args.actorId,
      subjectTierId: args.tierId,
      eventType: "tier.updated",
      correlationId: args.tierId,
      payloadJson: JSON.stringify({
        tierId: args.tierId,
        updatedFields: Object.keys(patch).filter((key) => key !== "updatedAt"),
      }),
    });

    return args.tierId;
  },
});

export const listTiers = query({
  args: {
    guildId: v.id("guilds"),
  },
  handler: async (ctx, args) => {
    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();

    tiers.sort((a, b) => a.name.localeCompare(b.name));
    return tiers;
  },
});

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
      subjectDiscordUserId: args.discordUserId,
      subjectTierId: args.tierId,
      subjectGrantId: grantId,
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

    await enqueueOutboundWebhookDeliveries(ctx, {
      guildId: args.guildId,
      eventType: "grant.created",
      eventId: grantId,
      payloadJson: createOutboundWebhookPayload({
        id: grantId,
        type: "grant.created",
        guildId: args.guildId,
        occurredAt: now,
        data: {
          grantId,
          tierId: args.tierId,
          discordUserId: args.discordUserId,
          status,
          validFrom,
          validThrough: validThrough ?? null,
          source: "manual",
        },
      }),
    });

    await enqueueRoleConnectionUpdate(ctx, {
      guildId: args.guildId,
      discordUserId: args.discordUserId,
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
      subjectDiscordUserId: grant.discordUserId,
      subjectTierId: grant.tierId,
      subjectGrantId: args.grantId,
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

    await enqueueOutboundWebhookDeliveries(ctx, {
      guildId: args.guildId,
      eventType: "grant.revoked",
      eventId: args.grantId,
      payloadJson: createOutboundWebhookPayload({
        id: args.grantId,
        type: "grant.revoked",
        guildId: args.guildId,
        occurredAt: now,
        data: {
          grantId: args.grantId,
          tierId: grant.tierId,
          discordUserId: grant.discordUserId,
          status: nextStatus,
          previousStatus: grant.status,
          validThrough: nextValidThrough,
          previousValidThrough: grant.validThrough ?? null,
          source: grant.source,
        },
      }),
    });

    if (shouldPatch) {
      await enqueueRoleConnectionUpdate(ctx, {
        guildId: args.guildId,
        discordUserId: grant.discordUserId,
      });
    }

    return args.grantId;
  },
});

export const getMemberSnapshot = query({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.string(),
    auditLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memberIdentity = await ctx.db
      .query("memberIdentities")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId)
      )
      .unique();

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId)
      )
      .collect();

    grants.sort((a, b) => b.validFrom - a.validFrom);

    const tierIds = Array.from(new Set(grants.map((grant) => grant.tierId)));
    const tiers = await Promise.all(tierIds.map((tierId) => ctx.db.get(tierId)));
    const tierById = new Map(
      tiers
        .filter((tier): tier is NonNullable<typeof tier> => Boolean(tier))
        .map((tier) => [tier._id, tier])
    );

    const grantsWithTier = grants.map((grant) => ({
      ...grant,
      tier: tierById.get(grant.tierId) ?? null,
    }));

    const auditLimit = Math.max(1, Math.min(args.auditLimit ?? 25, 100));
    const auditEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_guild_user_time", (q) =>
        q.eq("guildId", args.guildId).eq("subjectDiscordUserId", args.discordUserId)
      )
      .order("desc")
      .take(auditLimit);

    return {
      memberIdentity,
      grants: grantsWithTier,
      auditEvents,
    };
  },
});

export const getActiveMemberCountsByTier = query({
  args: {
    guildId: v.id("guilds"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();
    tiers.sort((a, b) => a.name.localeCompare(b.name));

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    const membersByTier = new Map<string, Set<string>>();
    for (const grant of grants) {
      if (!isGrantEffective(grant, now)) {
        continue;
      }
      const tierId = grant.tierId;
      let members = membersByTier.get(tierId);
      if (!members) {
        members = new Set<string>();
        membersByTier.set(tierId, members);
      }
      members.add(grant.discordUserId);
    }

    return tiers.map((tier) => ({
      tierId: tier._id,
      tierName: tier.name,
      activeMemberCount: membersByTier.get(tier._id)?.size ?? 0,
    }));
  },
});

export const expireEntitlementGrants = mutation({
  args: {
    asOf: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = coerceExpirationTime(args.asOf);
    let remaining = coerceExpirationLimit(args.limit);
    const expiredGrantIds: Array<Doc<"entitlementGrants">["_id"]> = [];
    const roleConnectionUpdates = new Map<
      string,
      { guildId: Doc<"guilds">["_id"]; discordUserId: string }
    >();

    for (const status of activeGrantStatuses) {
      if (remaining <= 0) {
        break;
      }
      const candidates = await ctx.db
        .query("entitlementGrants")
        .withIndex("by_status_validThrough", (q) =>
          q.eq("status", status).lt("validThrough", now)
        )
        .take(remaining);

      for (const grant of candidates) {
        if (remaining <= 0) {
          break;
        }
        const current = await ctx.db.get(grant._id);
        if (!current) {
          continue;
        }
        if (!activeGrantStatuses.includes(current.status)) {
          continue;
        }
        if (
          current.validThrough === undefined ||
          current.validThrough > now
        ) {
          continue;
        }

        await ctx.db.patch(grant._id, {
          status: "expired",
          updatedAt: now,
        });

        await ctx.db.insert("auditEvents", {
          guildId: current.guildId,
          timestamp: now,
          actorType: "system",
          subjectDiscordUserId: current.discordUserId,
          subjectTierId: current.tierId,
          subjectGrantId: grant._id,
          eventType: "grant.expired",
          correlationId: grant._id,
          payloadJson: JSON.stringify({
            grantId: grant._id,
            previousStatus: current.status,
            validThrough: current.validThrough,
          }),
        });

        const roleConnectionKey = `${current.guildId}:${current.discordUserId}`;
        if (!roleConnectionUpdates.has(roleConnectionKey)) {
          roleConnectionUpdates.set(roleConnectionKey, {
            guildId: current.guildId,
            discordUserId: current.discordUserId,
          });
        }

        expiredGrantIds.push(grant._id);
        remaining -= 1;
      }
    }

    for (const update of roleConnectionUpdates.values()) {
      await enqueueRoleConnectionUpdate(ctx, update);
    }

    return {
      expiredCount: expiredGrantIds.length,
      expiredGrantIds,
      evaluatedAt: now,
    };
  },
});
