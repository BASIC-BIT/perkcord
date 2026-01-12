import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const providerName = v.union(
  v.literal("stripe"),
  v.literal("authorize_net"),
  v.literal("nmi")
);
const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));

const normalizeId = (value: string, fieldName: string) => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
  return trimmed;
};

export const upsertProviderCustomerLink = mutation({
  args: {
    guildId: v.id("guilds"),
    provider: providerName,
    providerCustomerId: v.string(),
    discordUserId: v.string(),
    actorId: v.optional(v.string()),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const providerCustomerId = normalizeId(
      args.providerCustomerId,
      "Provider customer id"
    );
    const discordUserId = normalizeId(args.discordUserId, "Discord user id");

    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for provider customer link.");
    }

    const existing = await ctx.db
      .query("providerCustomerLinks")
      .withIndex("by_guild_provider_customer", (q) =>
        q
          .eq("guildId", args.guildId)
          .eq("provider", args.provider)
          .eq("providerCustomerId", providerCustomerId)
      )
      .unique();

    if (!existing) {
      const linkId = await ctx.db.insert("providerCustomerLinks", {
        guildId: args.guildId,
        provider: args.provider,
        providerCustomerId,
        discordUserId,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("auditEvents", {
        guildId: args.guildId,
        timestamp: now,
        actorType: args.actorType ?? "system",
        actorId: args.actorId,
        subjectDiscordUserId: discordUserId,
        eventType: "provider_customer.linked",
        correlationId: linkId,
        payloadJson: JSON.stringify({
          linkId,
          provider: args.provider,
          providerCustomerId,
          discordUserId,
        }),
      });

      return linkId;
    }

    if (existing.discordUserId === discordUserId) {
      return existing._id;
    }

    const patch: Partial<Doc<"providerCustomerLinks">> = {
      discordUserId,
      updatedAt: now,
    };

    await ctx.db.patch(existing._id, patch);

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: args.actorType ?? "system",
      actorId: args.actorId,
      subjectDiscordUserId: discordUserId,
      eventType: "provider_customer.updated",
      correlationId: existing._id,
      payloadJson: JSON.stringify({
        linkId: existing._id,
        provider: args.provider,
        providerCustomerId,
        previousDiscordUserId: existing.discordUserId,
        discordUserId,
      }),
    });

    return existing._id;
  },
});

export const getProviderCustomerLink = query({
  args: {
    guildId: v.id("guilds"),
    provider: providerName,
    providerCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const providerCustomerId = normalizeId(
      args.providerCustomerId,
      "Provider customer id"
    );

    return await ctx.db
      .query("providerCustomerLinks")
      .withIndex("by_guild_provider_customer", (q) =>
        q
          .eq("guildId", args.guildId)
          .eq("provider", args.provider)
          .eq("providerCustomerId", providerCustomerId)
      )
      .unique();
  },
});

export const getProviderCustomerLinkForUser = query({
  args: {
    guildId: v.id("guilds"),
    provider: providerName,
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const discordUserId = normalizeId(args.discordUserId, "Discord user id");

    const links = await ctx.db
      .query("providerCustomerLinks")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId)
      )
      .collect();

    return links.find((link) => link.provider === args.provider) ?? null;
  },
});
