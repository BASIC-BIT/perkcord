import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const entitlementStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("suspended_dispute")
);
const roleSyncRequestStatus = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed")
);
const providerName = v.union(
  v.literal("stripe"),
  v.literal("authorize_net"),
  v.literal("nmi")
);
const normalizedProviderEventType = v.union(
  v.literal("PAYMENT_SUCCEEDED"),
  v.literal("PAYMENT_FAILED"),
  v.literal("SUBSCRIPTION_ACTIVE"),
  v.literal("SUBSCRIPTION_PAST_DUE"),
  v.literal("SUBSCRIPTION_CANCELED"),
  v.literal("REFUND_ISSUED"),
  v.literal("CHARGEBACK_OPENED"),
  v.literal("CHARGEBACK_CLOSED")
);
const providerEventStatus = v.union(
  v.literal("processed"),
  v.literal("failed")
);

const entitlementSource = v.union(
  v.literal("stripe_subscription"),
  v.literal("stripe_one_time"),
  v.literal("authorize_net_subscription"),
  v.literal("authorize_net_one_time"),
  v.literal("nmi_subscription"),
  v.literal("nmi_one_time"),
  v.literal("manual"),
  v.literal("api")
);

export default defineSchema({
  guilds: defineTable({
    discordGuildId: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_discord_id", ["discordGuildId"]),

  tiers: defineTable({
    guildId: v.id("guilds"),
    name: v.string(),
    description: v.optional(v.string()),
    roleIds: v.array(v.string()),
    entitlementPolicy: v.object({
      kind: v.union(v.literal("subscription"), v.literal("one_time")),
      durationDays: v.optional(v.number()),
      isLifetime: v.optional(v.boolean()),
      gracePeriodDays: v.optional(v.number()),
      cancelAtPeriodEnd: v.optional(v.boolean()),
    }),
    providerRefs: v.optional(
      v.object({
        stripeSubscriptionPriceIds: v.optional(v.array(v.string())),
        stripeOneTimePriceIds: v.optional(v.array(v.string())),
        authorizeNetSubscriptionIds: v.optional(v.array(v.string())),
        authorizeNetOneTimeKeys: v.optional(v.array(v.string())),
        nmiPlanIds: v.optional(v.array(v.string())),
        nmiOneTimeKeys: v.optional(v.array(v.string())),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_guild", ["guildId"]),

  memberIdentities: defineTable({
    guildId: v.id("guilds"),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
    oauth: v.optional(
      v.object({
        accessTokenEnc: v.string(),
        refreshTokenEnc: v.string(),
        expiresAt: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_user", ["guildId", "discordUserId"])
    .index("by_guild", ["guildId"]),

  providerCustomerLinks: defineTable({
    guildId: v.id("guilds"),
    provider: providerName,
    providerCustomerId: v.string(),
    discordUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_provider_customer", [
      "guildId",
      "provider",
      "providerCustomerId",
    ])
    .index("by_guild_user", ["guildId", "discordUserId"])
    .index("by_provider_customer", ["provider", "providerCustomerId"]),

  entitlementGrants: defineTable({
    guildId: v.id("guilds"),
    tierId: v.id("tiers"),
    discordUserId: v.string(),
    status: entitlementStatus,
    validFrom: v.number(),
    validThrough: v.optional(v.number()),
    source: entitlementSource,
    sourceRefProvider: v.optional(v.string()),
    sourceRefId: v.optional(v.string()),
    sourceRefSecondaryIds: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_user", ["guildId", "discordUserId"])
    .index("by_tier", ["tierId"])
    .index("by_status_validThrough", ["status", "validThrough"])
    .index("by_source_ref", ["sourceRefProvider", "sourceRefId"]),

  providerEvents: defineTable({
    provider: providerName,
    providerEventId: v.string(),
    providerEventType: v.optional(v.string()),
    normalizedEventType: normalizedProviderEventType,
    providerObjectId: v.optional(v.string()),
    providerCustomerId: v.optional(v.string()),
    providerPriceIds: v.optional(v.array(v.string())),
    occurredAt: v.optional(v.number()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    processedStatus: v.optional(providerEventStatus),
    lastError: v.optional(v.string()),
    payloadSummaryJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_event", ["provider", "providerEventId"])
    .index("by_provider_time", ["provider", "receivedAt"]),

  roleSyncRequests: defineTable({
    guildId: v.id("guilds"),
    scope: v.union(v.literal("guild"), v.literal("user")),
    discordUserId: v.optional(v.string()),
    status: roleSyncRequestStatus,
    requestedAt: v.number(),
    requestedByActorType: v.union(v.literal("system"), v.literal("admin")),
    requestedByActorId: v.optional(v.string()),
    reason: v.optional(v.string()),
    lastError: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_guild_status", ["guildId", "status"])
    .index("by_guild_user_status", ["guildId", "discordUserId", "status"])
    .index("by_guild_time", ["guildId", "requestedAt"])
    .index("by_guild_user_time", ["guildId", "discordUserId", "requestedAt"]),

  auditEvents: defineTable({
    guildId: v.id("guilds"),
    timestamp: v.number(),
    actorType: v.union(v.literal("system"), v.literal("admin")),
    actorId: v.optional(v.string()),
    subjectDiscordUserId: v.optional(v.string()),
    subjectTierId: v.optional(v.id("tiers")),
    subjectGrantId: v.optional(v.id("entitlementGrants")),
    eventType: v.string(),
    correlationId: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
  })
    .index("by_guild_time", ["guildId", "timestamp"])
    .index("by_guild_user_time", [
      "guildId",
      "subjectDiscordUserId",
      "timestamp",
    ]),

  guildDiagnostics: defineTable({
    guildId: v.id("guilds"),
    checkedAt: v.number(),
    botUserId: v.optional(v.string()),
    botRoleId: v.optional(v.string()),
    permissionsOk: v.boolean(),
    missingPermissions: v.array(v.string()),
    roleHierarchyOk: v.boolean(),
    blockedRoleIds: v.array(v.string()),
    rolesExistOk: v.boolean(),
    missingRoleIds: v.array(v.string()),
    checkedRoleIds: v.array(v.string()),
    overallStatus: v.union(
      v.literal("pass"),
      v.literal("warn"),
      v.literal("fail")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_guild", ["guildId"]),
});
