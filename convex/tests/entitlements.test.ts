import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { createTestClient } from "./testClient.utils";

const createGuild = async () => {
  const t = createTestClient();
  const guildId = await t.mutation(api.guilds.upsertGuild, {
    discordGuildId: "guild-1",
    name: "Guild One",
    actorType: "system",
    actorId: "tester",
  });
  return { t, guildId };
};

const baseSubscriptionTier = (guildId: string) => ({
  guildId,
  slug: "gold",
  name: "Gold",
  description: "Gold tier",
  displayPrice: "$10",
  perks: ["perk-a", "perk-b"],
  sortOrder: 1,
  roleIds: ["role-1"],
  entitlementPolicy: { kind: "subscription" as const },
  checkoutConfig: {
    authorizeNet: { amount: "10", intervalLength: 1, intervalUnit: "months" },
  },
  providerRefs: { stripeSubscriptionPriceIds: ["price_sub"] },
  actorId: "tester",
});

const baseOneTimeTier = (guildId: string) => ({
  guildId,
  slug: "supporter",
  name: "Supporter",
  description: "Supporter tier",
  displayPrice: "$5",
  perks: ["perk-x"],
  sortOrder: 2,
  roleIds: ["role-2"],
  entitlementPolicy: { kind: "one_time" as const, durationDays: 30 },
  checkoutConfig: { authorizeNet: { amount: "5" } },
  providerRefs: { stripeOneTimePriceIds: ["price_one"] },
  actorId: "tester",
});

describe("entitlements", () => {
  it("creates and lists tiers", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    expect(tierId).toBeDefined();
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.slug).toBe("gold");
  });

  it("orders tiers and normalizes provider references", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, {
      ...baseSubscriptionTier(guildId),
      slug: "alpha",
      name: "Alpha",
      sortOrder: 2,
      providerRefs: { stripeSubscriptionPriceIds: [" price_a ", "price_a"] },
    });
    await t.mutation(api.entitlements.createTier, {
      ...baseSubscriptionTier(guildId),
      slug: "beta",
      name: "Beta",
      sortOrder: 1,
      providerRefs: { stripeSubscriptionPriceIds: ["price_b"] },
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    expect(tiers.map((tier) => tier.slug)).toEqual(["beta", "alpha"]);
    expect(tiers[0]?.providerRefs?.stripeSubscriptionPriceIds).toEqual(["price_b"]);
    expect(tiers[1]?.providerRefs?.stripeSubscriptionPriceIds).toEqual(["price_a"]);
  });

  it("enforces slug uniqueness and format", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        slug: "Gold",
      }),
    ).rejects.toThrow("Tier slug is already in use for this guild.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        slug: "Bad Slug",
      }),
    ).rejects.toThrow("Tier slug must use lowercase letters, numbers, and dashes.");
  });

  it("rejects invalid entitlement policies", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        entitlementPolicy: { kind: "one_time" as const },
      }),
    ).rejects.toThrow("One-time entitlements require either durationDays or isLifetime=true");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        entitlementPolicy: { kind: "subscription" as const, durationDays: 30 },
      }),
    ).rejects.toThrow("Subscriptions do not support durationDays.");
  });

  it("rejects mismatched provider refs and checkout config", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        providerRefs: { stripeOneTimePriceIds: ["price_one"] },
      }),
    ).rejects.toThrow("Subscription tiers cannot include one-time provider references.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: { authorizeNet: { amount: "10" } },
      }),
    ).rejects.toThrow(
      "Authorize.Net subscription checkout requires intervalLength and intervalUnit.",
    );
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseOneTimeTier(guildId),
        providerRefs: { stripeSubscriptionPriceIds: ["price_sub"] },
      }),
    ).rejects.toThrow("One-time tiers cannot include subscription provider references.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseOneTimeTier(guildId),
        checkoutConfig: {
          authorizeNet: {
            amount: "5",
            intervalLength: 1,
            intervalUnit: "months",
          },
        },
      }),
    ).rejects.toThrow("Authorize.Net one-time checkout does not allow intervals.");
  });

  it("returns public tiers with purchase types", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.createTier, {
      ...baseOneTimeTier(guildId),
      entitlementPolicy: { kind: "one_time" as const, isLifetime: true },
    });
    await t.mutation(api.entitlements.createTier, {
      ...baseOneTimeTier(guildId),
      slug: "supporter-month",
      entitlementPolicy: { kind: "one_time" as const, durationDays: 30 },
    });
    const publicTiers = await t.query(api.entitlements.listPublicTiersByDiscordGuild, {
      discordGuildId: "guild-1",
    });
    expect(publicTiers).toHaveLength(3);
    const purchaseTypes = publicTiers.map((tier) => tier.purchaseType).sort();
    expect(purchaseTypes).toEqual(["lifetime", "one_time", "subscription"]);
  });

  it("looks up tiers by slug", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    const tier = await t.query(api.entitlements.getTierBySlug, {
      guildId,
      slug: "gold",
    });
    expect(tier?.name).toBe("Gold");
    const missing = await t.query(api.entitlements.getTierBySlug, {
      guildId,
      slug: "missing",
    });
    expect(missing).toBeNull();
    const publicTier = await t.query(api.entitlements.getPublicTierBySlug, {
      discordGuildId: "guild-1",
      slug: "gold",
    });
    expect(publicTier?.slug).toBe("gold");
    const missingTier = await t.query(api.entitlements.getPublicTierBySlug, {
      discordGuildId: "missing",
      slug: "gold",
    });
    expect(missingTier).toBeNull();
  });

  it("updates tiers and enforces uniqueness", async () => {
    const { t, guildId } = await createGuild();
    const goldId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    await expect(
      t.mutation(api.entitlements.updateTier, {
        guildId,
        tierId: goldId,
        slug: "supporter",
        actorId: "tester",
      }),
    ).rejects.toThrow("Tier slug is already in use for this guild.");
    await expect(
      t.mutation(api.entitlements.updateTier, {
        guildId,
        tierId: goldId,
        providerRefs: { stripeOneTimePriceIds: ["price_one"] },
        actorId: "tester",
      }),
    ).rejects.toThrow("Subscription tiers cannot include one-time provider references.");
    await t.mutation(api.entitlements.updateTier, {
      guildId,
      tierId: goldId,
      perks: ["perk-a", "perk-a", " perk-b "],
      checkoutConfig: { nmi: { hostedUrl: "https://example.com/pay" } },
      actorId: "tester",
    });
    const updated = await t.query(api.entitlements.listTiers, { guildId });
    expect(updated[0]?.perks).toEqual(["perk-a", "perk-b"]);
  });

  it("creates, revokes, and expires manual grants", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    const grantId = await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-1",
      actorId: "tester",
    });
    const snapshot = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-1",
      auditLimit: 500,
    });
    expect(snapshot.grants).toHaveLength(1);
    expect(snapshot.grants[0]?.status).toBe("active");

    await t.mutation(api.entitlements.revokeEntitlementGrant, {
      guildId,
      grantId,
      actorId: "tester",
    });
    const updated = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-1",
    });
    expect(updated.grants[0]?.status).toBe("canceled");

    const now = Date.now();
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-expired",
      actorId: "tester",
      validFrom: now - 10_000,
      validThrough: now - 5_000,
    });
    const expired = await t.mutation(api.entitlements.expireEntitlementGrants, {
      asOf: now,
      limit: 10,
    });
    expect(expired.expiredCount).toBeGreaterThan(0);
  });

  it("counts active members by tier", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-2",
      actorId: "tester",
    });
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-2b",
      actorId: "tester",
      status: "past_due",
    });
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-future",
      actorId: "tester",
      validFrom: Date.now() + 60_000,
    });
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-expired",
      actorId: "tester",
      status: "expired",
    });
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-expired-2",
      actorId: "tester",
      validFrom: Date.now() - 10_000,
      validThrough: Date.now() - 5_000,
    });
    const counts = await t.query(api.entitlements.getActiveMemberCountsByTier, {
      guildId,
    });
    expect(counts[0]?.activeMemberCount).toBe(2);
  });

  it("returns member snapshots with identities and audits", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-identity",
      actorId: "tester",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("memberIdentities", {
        guildId,
        discordUserId: "user-identity",
        discordUsername: "tester",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("auditEvents", {
        guildId,
        timestamp: Date.now(),
        actorType: "system",
        subjectDiscordUserId: "user-identity",
        eventType: "test.event",
      });
    });
    const snapshot = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-identity",
      auditLimit: 1,
    });
    expect(snapshot.memberIdentity?.discordUsername).toBe("tester");
    expect(snapshot.auditEvents).toHaveLength(1);
  });

  it("clamps audit limits and handles missing tiers in snapshots", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-audit",
      actorId: "tester",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("auditEvents", {
        guildId,
        timestamp: Date.now(),
        actorType: "system",
        subjectDiscordUserId: "user-audit",
        eventType: "test.event.one",
      });
      await ctx.db.insert("auditEvents", {
        guildId,
        timestamp: Date.now(),
        actorType: "system",
        subjectDiscordUserId: "user-audit",
        eventType: "test.event.two",
      });
      await ctx.db.delete(tierId);
    });

    const lowLimit = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-audit",
      auditLimit: 0,
    });
    expect(lowLimit.auditEvents).toHaveLength(1);
    expect(lowLimit.grants[0]?.tier).toBeNull();

    const highLimit = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-audit",
      auditLimit: 200,
    });
    expect(highLimit.auditEvents.length).toBeLessThanOrEqual(100);
  });

  it("rejects invalid tier fields", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        roleIds: [],
      }),
    ).rejects.toThrow("Tier must map to at least one role.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        sortOrder: -1,
      }),
    ).rejects.toThrow("sortOrder must be a non-negative integer.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: { nmi: { hostedUrl: "ftp://invalid" } },
      }),
    ).rejects.toThrow("checkoutConfig.nmi.hostedUrl must be an http or https URL.");
  });

  it("rejects missing guilds and required tier fields", async () => {
    const { t, guildId } = await createGuild();
    await t.run(async (ctx) => {
      await ctx.db.delete(guildId);
    });
    await expect(
      t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId)),
    ).rejects.toThrow("Guild not found for tier.");

    const { t: nextClient, guildId: nextGuildId } = await createGuild();
    await expect(
      nextClient.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(nextGuildId),
        slug: "   ",
      }),
    ).rejects.toThrow("Tier slug is required.");
    await expect(
      nextClient.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(nextGuildId),
        displayPrice: "   ",
      }),
    ).rejects.toThrow("Display price is required.");
  });

  it("validates entitlement policy edge cases", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        entitlementPolicy: { kind: "subscription", isLifetime: true },
      }),
    ).rejects.toThrow("Subscriptions cannot be marked as lifetime.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseOneTimeTier(guildId),
        entitlementPolicy: { kind: "one_time", durationDays: 30, isLifetime: true },
      }),
    ).rejects.toThrow(
      "One-time entitlements require either durationDays or isLifetime=true (but not both).",
    );
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseOneTimeTier(guildId),
        entitlementPolicy: { kind: "one_time", durationDays: 0 },
      }),
    ).rejects.toThrow("durationDays must be a positive integer.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        entitlementPolicy: { kind: "subscription", gracePeriodDays: -1 },
      }),
    ).rejects.toThrow("gracePeriodDays must be a non-negative integer.");
  });

  it("enforces checkout config limits and required values", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: {
          authorizeNet: { amount: "10", intervalLength: 13, intervalUnit: "months" },
        },
      }),
    ).rejects.toThrow("Authorize.Net intervalLength cannot exceed 12 months.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: {
          authorizeNet: { amount: "10", intervalLength: 366, intervalUnit: "days" },
        },
      }),
    ).rejects.toThrow("Authorize.Net intervalLength cannot exceed 365 days.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: {
          authorizeNet: { amount: "10", intervalLength: 1.5, intervalUnit: "months" },
        },
      }),
    ).rejects.toThrow("checkoutConfig.authorizeNet.intervalLength must be a positive integer.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: {
          authorizeNet: { amount: "0", intervalLength: 1, intervalUnit: "months" },
        },
      }),
    ).rejects.toThrow("checkoutConfig.authorizeNet.amount must be a positive number.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseOneTimeTier(guildId),
        checkoutConfig: { authorizeNet: { amount: "5", intervalUnit: "days" } },
      }),
    ).rejects.toThrow("Authorize.Net one-time checkout does not allow intervals.");
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: { nmi: { hostedUrl: " " } },
      }),
    ).rejects.toThrow("checkoutConfig.nmi.hostedUrl is required.");
  });

  it("stores normalized provider references and allows empty refs", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, {
      ...baseSubscriptionTier(guildId),
      slug: "empty-refs",
      providerRefs: {
        stripeSubscriptionPriceIds: ["  ", " "],
        authorizeNetSubscriptionIds: [" "],
      },
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    const stored = tiers.find((tier) => tier.slug === "empty-refs");
    expect(stored?.providerRefs).toBeUndefined();
  });

  it("normalizes provider refs across payment providers", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, {
      ...baseSubscriptionTier(guildId),
      slug: "multi-sub",
      providerRefs: {
        stripeSubscriptionPriceIds: [" price_sub ", "price_sub"],
        authorizeNetSubscriptionIds: [" sub_a ", "sub_a"],
        nmiPlanIds: [" plan_a ", "plan_a"],
      },
    });
    await t.mutation(api.entitlements.createTier, {
      ...baseOneTimeTier(guildId),
      slug: "multi-one",
      providerRefs: {
        stripeOneTimePriceIds: [" price_one ", "price_one"],
        authorizeNetOneTimeKeys: [" key_a ", "key_a"],
        nmiOneTimeKeys: [" nmi_key ", "nmi_key"],
      },
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    const subscriptionTier = tiers.find((tier) => tier.slug === "multi-sub");
    const oneTimeTier = tiers.find((tier) => tier.slug === "multi-one");
    expect(subscriptionTier?.providerRefs?.authorizeNetSubscriptionIds).toEqual(["sub_a"]);
    expect(subscriptionTier?.providerRefs?.nmiPlanIds).toEqual(["plan_a"]);
    expect(oneTimeTier?.providerRefs?.authorizeNetOneTimeKeys).toEqual(["key_a"]);
    expect(oneTimeTier?.providerRefs?.nmiOneTimeKeys).toEqual(["nmi_key"]);
  });

  it("supports tiers without checkout config or provider refs", async () => {
    const { t, guildId } = await createGuild();
    await t.mutation(api.entitlements.createTier, {
      guildId,
      slug: "plain",
      name: "Plain",
      description: "Plain tier",
      displayPrice: "$1",
      perks: ["perk"],
      roleIds: ["role-plain"],
      entitlementPolicy: { kind: "subscription" as const },
      actorId: "tester",
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    const plain = tiers.find((tier) => tier.slug === "plain");
    expect(plain?.checkoutConfig).toBeUndefined();
    expect(plain?.providerRefs).toBeUndefined();
  });

  it("updates multiple tier fields in one request", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      name: "Gold Plus",
      description: "Updated description",
      displayPrice: "$12",
      roleIds: ["role-1", "role-3"],
      sortOrder: 3,
      entitlementPolicy: { kind: "subscription" as const, gracePeriodDays: 2 },
      providerRefs: { stripeSubscriptionPriceIds: ["price_sub_new"] },
      actorId: "tester",
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    const updated = tiers[0];
    expect(updated?.name).toBe("Gold Plus");
    expect(updated?.description).toBe("Updated description");
    expect(updated?.displayPrice).toBe("$12");
    expect(updated?.roleIds).toEqual(["role-1", "role-3"]);
    expect(updated?.sortOrder).toBe(3);
    expect(updated?.entitlementPolicy?.gracePeriodDays).toBe(2);
    expect(updated?.providerRefs?.stripeSubscriptionPriceIds).toEqual(["price_sub_new"]);
  });

  it("updates perks when the length changes", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.mutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      perks: ["perk-only"],
      actorId: "tester",
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    expect(tiers[0]?.perks).toEqual(["perk-only"]);
  });

  it("allows tiers without sortOrder and ignores empty checkout config updates", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, {
      ...baseSubscriptionTier(guildId),
      slug: "no-sort",
      sortOrder: undefined,
    });
    await t.mutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      checkoutConfig: {},
      actorId: "tester",
    });
    const tiers = await t.query(api.entitlements.listTiers, { guildId });
    const noSort = tiers.find((tier) => tier.slug === "no-sort");
    expect(noSort?.sortOrder).toBeUndefined();
    expect(noSort?.checkoutConfig).toBeUndefined();
  });

  it("rejects empty Authorize.Net amounts", async () => {
    const { t, guildId } = await createGuild();
    await expect(
      t.mutation(api.entitlements.createTier, {
        ...baseSubscriptionTier(guildId),
        checkoutConfig: {
          authorizeNet: { amount: "   ", intervalLength: 1, intervalUnit: "months" },
        },
      }),
    ).rejects.toThrow("checkoutConfig.authorizeNet.amount is required.");
  });

  it("rejects manual grants when guild or tier is missing", async () => {
    const { t, guildId } = await createGuild();
    const otherGuildId = await t.mutation(api.guilds.upsertGuild, {
      discordGuildId: "guild-3",
      name: "Guild Three",
      actorType: "system",
      actorId: "tester",
    });
    const otherTierId = await t.mutation(
      api.entitlements.createTier,
      baseOneTimeTier(otherGuildId),
    );
    await expect(
      t.mutation(api.entitlements.createManualGrant, {
        guildId,
        tierId: otherTierId,
        discordUserId: "user-missing-tier",
        actorId: "tester",
      }),
    ).rejects.toThrow("Tier not found for guild.");

    await t.run(async (ctx) => {
      await ctx.db.delete(guildId);
    });
    await expect(
      t.mutation(api.entitlements.createManualGrant, {
        guildId,
        tierId: otherTierId,
        discordUserId: "user-missing-guild",
        actorId: "tester",
      }),
    ).rejects.toThrow("Guild not found for manual grant.");
  });

  it("updates revoke notes when provided", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    const grantId = await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-note",
      actorId: "tester",
    });
    await t.mutation(api.entitlements.revokeEntitlementGrant, {
      guildId,
      grantId,
      actorId: "tester",
      note: "Manual revoke",
    });
    const snapshot = await t.query(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId: "user-note",
    });
    expect(snapshot.grants[0]?.note).toBe("Manual revoke");
  });

  it("returns early when updateTier makes no changes", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    const auditsBefore = await t.run(async (ctx) => ctx.db.query("auditEvents").collect());
    const result = await t.mutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      actorId: "tester",
    });
    const auditsAfter = await t.run(async (ctx) => ctx.db.query("auditEvents").collect());
    expect(result).toBe(tierId);
    expect(auditsAfter).toHaveLength(auditsBefore.length);
  });

  it("rejects updating missing tiers or guild mismatches", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseSubscriptionTier(guildId));
    await t.run(async (ctx) => {
      await ctx.db.delete(tierId);
    });
    await expect(
      t.mutation(api.entitlements.updateTier, {
        guildId,
        tierId,
        actorId: "tester",
      }),
    ).rejects.toThrow("Tier not found.");

    const secondGuildId = await t.mutation(api.guilds.upsertGuild, {
      discordGuildId: "guild-2",
      name: "Guild Two",
      actorType: "system",
      actorId: "tester",
    });
    const newTierId = await t.mutation(
      api.entitlements.createTier,
      baseSubscriptionTier(secondGuildId),
    );
    await expect(
      t.mutation(api.entitlements.updateTier, {
        guildId,
        tierId: newTierId,
        actorId: "tester",
      }),
    ).rejects.toThrow("Tier does not belong to guild.");
  });

  it("skips role connection updates when revoking an unchanged grant", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    const now = Date.now();
    const grantId = await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-noop",
      actorId: "tester",
      status: "canceled",
      validFrom: now - 10_000,
      validThrough: now - 5_000,
    });
    const updatesBefore = await t.run(async (ctx) =>
      ctx.db.query("roleConnectionUpdates").collect(),
    );
    await t.mutation(api.entitlements.revokeEntitlementGrant, {
      guildId,
      grantId,
      actorId: "tester",
    });
    const updatesAfter = await t.run(async (ctx) =>
      ctx.db.query("roleConnectionUpdates").collect(),
    );
    expect(updatesAfter).toHaveLength(updatesBefore.length);
  });

  it("rejects revoking missing grants", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    const grantId = await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-missing",
      actorId: "tester",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(grantId);
    });
    await expect(
      t.mutation(api.entitlements.revokeEntitlementGrant, {
        guildId,
        grantId,
        actorId: "tester",
      }),
    ).rejects.toThrow("Entitlement grant not found.");
  });

  it("skips expiring grants that are still active and caps the expiration limit", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-still-active",
      actorId: "tester",
      validThrough: Date.now() + 60_000,
    });
    const result = await t.mutation(api.entitlements.expireEntitlementGrants, {
      limit: 5000,
    });
    expect(result.expiredCount).toBe(0);
  });

  it("stops expiring grants when the limit is reached", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    const now = Date.now();
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-expire-a",
      actorId: "tester",
      validFrom: now - 10_000,
      validThrough: now - 5_000,
    });
    await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-expire-b",
      actorId: "tester",
      status: "past_due",
      validFrom: now - 20_000,
      validThrough: now - 10_000,
    });
    const result = await t.mutation(api.entitlements.expireEntitlementGrants, {
      asOf: now,
      limit: 1,
    });
    expect(result.expiredCount).toBe(1);
  });

  it("rejects invalid grant operations", async () => {
    const { t, guildId } = await createGuild();
    const tierId = await t.mutation(api.entitlements.createTier, baseOneTimeTier(guildId));
    await expect(
      t.mutation(api.entitlements.createManualGrant, {
        guildId,
        tierId,
        discordUserId: "user-3",
        actorId: "tester",
        validFrom: 10,
        validThrough: 5,
      }),
    ).rejects.toThrow("validThrough must be after validFrom.");
    const grantId = await t.mutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId: "user-3",
      actorId: "tester",
    });
    const wrongGuildId = await t.mutation(api.guilds.upsertGuild, {
      discordGuildId: "guild-2",
      name: "Guild Two",
      actorType: "system",
      actorId: "tester",
    });
    await expect(
      t.mutation(api.entitlements.revokeEntitlementGrant, {
        guildId: wrongGuildId,
        grantId,
        actorId: "tester",
      }),
    ).rejects.toThrow("Entitlement grant does not belong to guild.");
  });

  it("rejects invalid expireEntitlementGrants args", async () => {
    const { t } = await createGuild();
    await expect(
      t.mutation(api.entitlements.expireEntitlementGrants, { limit: 0 }),
    ).rejects.toThrow("limit must be a positive integer.");
    await expect(
      t.mutation(api.entitlements.expireEntitlementGrants, { asOf: -1 }),
    ).rejects.toThrow("asOf must be a non-negative integer.");
    const result = await t.mutation(api.entitlements.expireEntitlementGrants, {});
    expect(result.expiredCount).toBeGreaterThanOrEqual(0);
  });
});
