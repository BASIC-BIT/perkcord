import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  createOutboundWebhookPayload,
  enqueueOutboundWebhookDeliveries,
} from "./outboundWebhookQueue";
import { enqueueRoleConnectionUpdate } from "./roleConnectionQueue";
import { applyEntitlementPolicyDefaults } from "./entitlementPolicyDefaults";

const entitlementStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("suspended_dispute"),
);
const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = ["active", "past_due"];

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
  }),
);
const checkoutConfig = v.optional(
  v.object({
    authorizeNet: v.optional(
      v.object({
        amount: v.string(),
        intervalLength: v.optional(v.number()),
        intervalUnit: v.optional(v.union(v.literal("days"), v.literal("months"))),
      }),
    ),
    nmi: v.optional(
      v.object({
        hostedUrl: v.string(),
      }),
    ),
  }),
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

type CheckoutConfig = {
  authorizeNet?: {
    amount: string;
    intervalLength?: number;
    intervalUnit?: "days" | "months";
  };
  nmi?: {
    hostedUrl: string;
  };
};

const normalizeRoleIds = (roleIds: string[]) => Array.from(new Set(roleIds));
const normalizeSlug = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new Error("Tier slug is required.");
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new Error("Tier slug must use lowercase letters, numbers, and dashes.");
  }
  return trimmed;
};

const normalizeDisplayPrice = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Display price is required.");
  }
  return trimmed;
};

const normalizePerks = (perks: string[]) => {
  const cleaned = perks.map((perk) => perk.trim()).filter((perk) => perk.length > 0);
  return Array.from(new Set(cleaned));
};

const arraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const normalizeSortOrder = (value?: number) => {
  if (value === undefined) {
    return undefined;
  }
  assertNonNegativeInteger(value, "sortOrder");
  return value;
};

const normalizeAmount = (value: string, fieldName: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return parsed.toFixed(2);
};

const normalizeHostedUrl = (value: string, fieldName: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${fieldName} must be an http or https URL.`);
    }
    return url.toString();
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : `${fieldName} must be a valid URL.`;
    throw new Error(message);
  }
};

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
        "One-time entitlements require either durationDays or isLifetime=true (but not both).",
      );
    }
  }
};

const validateRoleIds = (roleIds: string[]) => {
  if (roleIds.length === 0) {
    throw new Error("Tier must map to at least one role.");
  }
};

const normalizeIdList = (values?: string[]) => {
  if (!values) {
    return undefined;
  }
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : undefined;
};

const normalizeProviderRefs = (refs?: ProviderRefs) => {
  if (!refs) {
    return undefined;
  }
  const normalized: ProviderRefs = {};
  const stripeSubscriptionPriceIds = normalizeIdList(refs.stripeSubscriptionPriceIds);
  if (stripeSubscriptionPriceIds) {
    normalized.stripeSubscriptionPriceIds = stripeSubscriptionPriceIds;
  }
  const stripeOneTimePriceIds = normalizeIdList(refs.stripeOneTimePriceIds);
  if (stripeOneTimePriceIds) {
    normalized.stripeOneTimePriceIds = stripeOneTimePriceIds;
  }
  const authorizeNetSubscriptionIds = normalizeIdList(refs.authorizeNetSubscriptionIds);
  if (authorizeNetSubscriptionIds) {
    normalized.authorizeNetSubscriptionIds = authorizeNetSubscriptionIds;
  }
  const authorizeNetOneTimeKeys = normalizeIdList(refs.authorizeNetOneTimeKeys);
  if (authorizeNetOneTimeKeys) {
    normalized.authorizeNetOneTimeKeys = authorizeNetOneTimeKeys;
  }
  const nmiPlanIds = normalizeIdList(refs.nmiPlanIds);
  if (nmiPlanIds) {
    normalized.nmiPlanIds = nmiPlanIds;
  }
  const nmiOneTimeKeys = normalizeIdList(refs.nmiOneTimeKeys);
  if (nmiOneTimeKeys) {
    normalized.nmiOneTimeKeys = nmiOneTimeKeys;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeAuthorizeNetConfig = (
  policy: EntitlementPolicy,
  config: CheckoutConfig["authorizeNet"],
) => {
  if (!config) {
    return undefined;
  }
  const amount = normalizeAmount(config.amount, "checkoutConfig.authorizeNet.amount");
  if (policy.kind === "subscription") {
    if (!config.intervalLength || !config.intervalUnit) {
      throw new Error(
        "Authorize.Net subscription checkout requires intervalLength and intervalUnit.",
      );
    }
    assertPositiveInteger(config.intervalLength, "checkoutConfig.authorizeNet.intervalLength");
    if (config.intervalUnit === "months" && config.intervalLength > 12) {
      throw new Error("Authorize.Net intervalLength cannot exceed 12 months.");
    }
    if (config.intervalUnit === "days" && config.intervalLength > 365) {
      throw new Error("Authorize.Net intervalLength cannot exceed 365 days.");
    }
    return {
      amount,
      intervalLength: config.intervalLength,
      intervalUnit: config.intervalUnit,
    };
  }
  if (config.intervalLength !== undefined || config.intervalUnit !== undefined) {
    throw new Error("Authorize.Net one-time checkout does not allow intervals.");
  }
  return { amount };
};

const normalizeCheckoutConfig = (policy: EntitlementPolicy, config?: CheckoutConfig) => {
  if (!config) {
    return undefined;
  }
  const authorizeNet = normalizeAuthorizeNetConfig(policy, config.authorizeNet);
  const nmi = config.nmi
    ? {
        hostedUrl: normalizeHostedUrl(config.nmi.hostedUrl, "checkoutConfig.nmi.hostedUrl"),
      }
    : undefined;
  const normalized: CheckoutConfig = {};
  if (authorizeNet) {
    normalized.authorizeNet = authorizeNet;
  }
  if (nmi) {
    normalized.nmi = nmi;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const validateProviderRefsForPolicy = (policy: EntitlementPolicy, refs?: ProviderRefs) => {
  if (!refs) {
    return;
  }
  const hasSubscription =
    (refs.stripeSubscriptionPriceIds?.length ?? 0) > 0 ||
    (refs.authorizeNetSubscriptionIds?.length ?? 0) > 0 ||
    (refs.nmiPlanIds?.length ?? 0) > 0;
  const hasOneTime =
    (refs.stripeOneTimePriceIds?.length ?? 0) > 0 ||
    (refs.authorizeNetOneTimeKeys?.length ?? 0) > 0 ||
    (refs.nmiOneTimeKeys?.length ?? 0) > 0;
  if (policy.kind === "subscription" && hasOneTime) {
    throw new Error("Subscription tiers cannot include one-time provider references.");
  }
  if (policy.kind === "one_time" && hasSubscription) {
    throw new Error("One-time tiers cannot include subscription provider references.");
  }
};

const derivePurchaseType = (policy: EntitlementPolicy) => {
  if (policy.kind === "subscription") {
    return "subscription" as const;
  }
  return policy.isLifetime ? ("lifetime" as const) : ("one_time" as const);
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
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    displayPrice: v.string(),
    perks: v.array(v.string()),
    sortOrder: v.optional(v.number()),
    roleIds: v.array(v.string()),
    entitlementPolicy,
    checkoutConfig,
    providerRefs,
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for tier.");
    }

    const slug = normalizeSlug(args.slug);
    const existingSlug = await ctx.db
      .query("tiers")
      .withIndex("by_guild_slug", (q) => q.eq("guildId", args.guildId).eq("slug", slug))
      .unique();
    if (existingSlug) {
      throw new Error("Tier slug is already in use for this guild.");
    }

    const displayPrice = normalizeDisplayPrice(args.displayPrice);
    const perks = normalizePerks(args.perks);
    const sortOrder = normalizeSortOrder(args.sortOrder);
    const roleIds = normalizeRoleIds(args.roleIds);
    validateRoleIds(roleIds);
    const normalizedPolicy = applyEntitlementPolicyDefaults(args.entitlementPolicy);
    validateEntitlementPolicy(normalizedPolicy);
    const normalizedProviderRefs = normalizeProviderRefs(
      args.providerRefs as ProviderRefs | undefined,
    );
    const normalizedCheckoutConfig = normalizeCheckoutConfig(
      normalizedPolicy,
      args.checkoutConfig as CheckoutConfig | undefined,
    );
    validateProviderRefsForPolicy(normalizedPolicy, normalizedProviderRefs);

    const tierId = await ctx.db.insert("tiers", {
      guildId: args.guildId,
      slug,
      name: args.name,
      description: args.description,
      displayPrice,
      perks,
      sortOrder,
      roleIds,
      entitlementPolicy: normalizedPolicy,
      checkoutConfig: normalizedCheckoutConfig,
      providerRefs: normalizedProviderRefs,
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
        slug,
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
    slug: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    displayPrice: v.optional(v.string()),
    perks: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
    roleIds: v.optional(v.array(v.string())),
    entitlementPolicy: v.optional(entitlementPolicy),
    checkoutConfig: checkoutConfig,
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

    const nextSlug = args.slug ? normalizeSlug(args.slug) : tier.slug;
    if (args.slug && nextSlug !== tier.slug) {
      const existingSlug = await ctx.db
        .query("tiers")
        .withIndex("by_guild_slug", (q) => q.eq("guildId", args.guildId).eq("slug", nextSlug))
        .unique();
      if (existingSlug && existingSlug._id !== args.tierId) {
        throw new Error("Tier slug is already in use for this guild.");
      }
    }

    const nextDisplayPrice =
      args.displayPrice !== undefined
        ? normalizeDisplayPrice(args.displayPrice)
        : tier.displayPrice;
    const nextPerks = args.perks ? normalizePerks(args.perks) : tier.perks;
    const nextSortOrder =
      args.sortOrder !== undefined ? normalizeSortOrder(args.sortOrder) : tier.sortOrder;
    const nextRoleIds = args.roleIds ? normalizeRoleIds(args.roleIds) : tier.roleIds;
    if (args.roleIds) {
      validateRoleIds(nextRoleIds);
    }

    const nextPolicy = args.entitlementPolicy
      ? applyEntitlementPolicyDefaults(args.entitlementPolicy)
      : tier.entitlementPolicy;
    validateEntitlementPolicy(nextPolicy as EntitlementPolicy);

    const nextProviderRefs =
      args.providerRefs !== undefined
        ? normalizeProviderRefs(args.providerRefs as ProviderRefs | undefined)
        : normalizeProviderRefs(tier.providerRefs as ProviderRefs | undefined);
    const nextCheckoutConfig =
      args.checkoutConfig !== undefined
        ? normalizeCheckoutConfig(
            nextPolicy as EntitlementPolicy,
            args.checkoutConfig as CheckoutConfig | undefined,
          )
        : normalizeCheckoutConfig(
            nextPolicy as EntitlementPolicy,
            tier.checkoutConfig as CheckoutConfig | undefined,
          );
    validateProviderRefsForPolicy(nextPolicy as EntitlementPolicy, nextProviderRefs);

    const patch: Partial<Doc<"tiers">> = {};
    if (args.slug !== undefined && nextSlug !== tier.slug) {
      patch.slug = nextSlug;
    }
    if (args.name !== undefined && args.name !== tier.name) {
      patch.name = args.name;
    }
    if (args.description !== undefined && args.description !== tier.description) {
      patch.description = args.description;
    }
    if (args.displayPrice !== undefined && nextDisplayPrice !== tier.displayPrice) {
      patch.displayPrice = nextDisplayPrice;
    }
    if (args.perks && !arraysEqual(nextPerks, tier.perks)) {
      patch.perks = nextPerks;
    }
    if (args.sortOrder !== undefined && nextSortOrder !== tier.sortOrder) {
      patch.sortOrder = nextSortOrder;
    }
    if (args.roleIds && nextRoleIds !== tier.roleIds) {
      patch.roleIds = nextRoleIds;
    }
    if (args.entitlementPolicy) {
      patch.entitlementPolicy = nextPolicy;
    }
    if (args.checkoutConfig !== undefined) {
      patch.checkoutConfig = nextCheckoutConfig;
    }
    if (args.providerRefs !== undefined) {
      patch.providerRefs = nextProviderRefs;
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

    tiers.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
    return tiers;
  },
});

type PublicTier = {
  id: Doc<"tiers">["_id"];
  slug: string;
  name: string;
  description?: string;
  displayPrice: string;
  perks: string[];
  sortOrder?: number;
  purchaseType: "subscription" | "one_time" | "lifetime";
};

const buildPublicTier = (tier: Doc<"tiers">): PublicTier => ({
  id: tier._id,
  slug: tier.slug,
  name: tier.name,
  description: tier.description,
  displayPrice: tier.displayPrice,
  perks: tier.perks,
  sortOrder: tier.sortOrder,
  purchaseType: derivePurchaseType(tier.entitlementPolicy as EntitlementPolicy),
});

export const getTierBySlug = query({
  args: {
    guildId: v.id("guilds"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.slug);
    return await ctx.db
      .query("tiers")
      .withIndex("by_guild_slug", (q) => q.eq("guildId", args.guildId).eq("slug", slug))
      .unique();
  },
});

export const listPublicTiersByDiscordGuild = query({
  args: {
    discordGuildId: v.string(),
  },
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_id", (q) => q.eq("discordGuildId", args.discordGuildId))
      .unique();
    if (!guild) {
      return [] as PublicTier[];
    }

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", guild._id))
      .collect();

    tiers.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });

    return tiers.map(buildPublicTier);
  },
});

export const getPublicTierBySlug = query({
  args: {
    discordGuildId: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const guild = await ctx.db
      .query("guilds")
      .withIndex("by_discord_id", (q) => q.eq("discordGuildId", args.discordGuildId))
      .unique();
    if (!guild) {
      return null;
    }
    const slug = normalizeSlug(args.slug);
    const tier = await ctx.db
      .query("tiers")
      .withIndex("by_guild_slug", (q) => q.eq("guildId", guild._id).eq("slug", slug))
      .unique();
    if (!tier) {
      return null;
    }
    return buildPublicTier(tier);
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
      grant.validThrough === undefined || grant.validThrough > now ? now : grant.validThrough;

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
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId),
      )
      .unique();

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", args.discordUserId),
      )
      .collect();

    grants.sort((a, b) => b.validFrom - a.validFrom);

    const tierIds = Array.from(new Set(grants.map((grant) => grant.tierId)));
    const tiers = await Promise.all(tierIds.map((tierId) => ctx.db.get(tierId)));
    const tierById = new Map(
      tiers
        .filter((tier): tier is NonNullable<typeof tier> => Boolean(tier))
        .map((tier) => [tier._id, tier]),
    );

    const grantsWithTier = grants.map((grant) => ({
      ...grant,
      tier: tierById.get(grant.tierId) ?? null,
    }));

    const auditLimit = Math.max(1, Math.min(args.auditLimit ?? 25, 100));
    const auditEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_guild_user_time", (q) =>
        q.eq("guildId", args.guildId).eq("subjectDiscordUserId", args.discordUserId),
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
    tiers.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });

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
        .withIndex("by_status_validThrough", (q) => q.eq("status", status).lt("validThrough", now))
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
        if (current.validThrough === undefined || current.validThrough > now) {
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
