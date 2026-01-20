import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { unstable_noStore as noStore } from "next/cache";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { requireEnv } from "./serverEnv";

export type PublicTier = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  displayPrice: string;
  perks: string[];
  sortOrder?: number;
  purchaseType: "subscription" | "one_time" | "lifetime";
};

const getConvexClient = () => {
  noStore();
  const url = requireEnv("CONVEX_URL", "CONVEX_URL is not configured.");
  return new ConvexHttpClient(url);
};

export const fetchPublicTiers = async (discordGuildId: string) => {
  const convex = getConvexClient();
  return convex.query(api.entitlements.listPublicTiersByDiscordGuild, {
    discordGuildId,
  });
};

export const fetchPublicTierBySlug = async (discordGuildId: string, slug: string) => {
  const convex = getConvexClient();
  return convex.query(api.entitlements.getPublicTierBySlug, {
    discordGuildId,
    slug,
  });
};

export const fetchTierForCheckout = async (
  discordGuildId: string,
  slug: string,
): Promise<Doc<"tiers"> | null> => {
  const convex = getConvexClient();
  const guild = await convex.query(api.guilds.getGuildByDiscordId, {
    discordGuildId,
  });
  if (!guild?._id) {
    return null;
  }
  return convex.query(api.entitlements.getTierBySlug, {
    guildId: guild._id as Id<"guilds">,
    slug,
  });
};
