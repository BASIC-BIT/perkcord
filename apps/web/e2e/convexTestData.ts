import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type SeededTier = {
  slug: string;
  name: string;
  displayPrice: string;
  description: string;
  perks: string[];
  sortOrder: number;
};

export type SeedResult = {
  guildId: Id<"guilds">;
  discordGuildId: string;
  tiers: SeededTier[];
};

const DEFAULT_DISCORD_GUILD_ID = "123456789012345678";
const DEFAULT_GUILD_NAME = "Perkcord Test Guild";
const DEFAULT_ROLE_IDS = ["111111111111111111"];

const DEFAULT_TIERS: SeededTier[] = [
  {
    slug: "starter",
    name: "Starter",
    displayPrice: "$5 / month",
    description: "Starter access to the community.",
    perks: ["Member role", "Community chat", "Weekly updates"],
    sortOrder: 10,
  },
  {
    slug: "pro",
    name: "Pro",
    displayPrice: "$15 / month",
    description: "Expanded perks for core supporters.",
    perks: ["Premium channels", "Monthly Q&A", "Priority support"],
    sortOrder: 20,
  },
];

const readEnvValue = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getConvexUrl = () =>
  readEnvValue(process.env.CONVEX_URL) ?? "http://127.0.0.1:3210";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForConvex = async (client: ConvexHttpClient) => {
  const timeoutMs = 30_000;
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      await client.query(api.guilds.listGuilds, { limit: 1 });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Could not find public function")
      ) {
        throw new Error(
          "Convex backend is running but missing functions. Stop the running Convex local backend and re-run Playwright so it can start a fresh backend.",
        );
      }
      attempt += 1;
      const delay = Math.min(500 + attempt * 250, 2000);
      await sleep(delay);
    }
  }
  throw new Error("Convex did not become ready within 30s.");
};

const ensureTier = async (
  client: ConvexHttpClient,
  guildId: Id<"guilds">,
  tier: SeededTier,
) => {
  const existing = await client.query(api.entitlements.getTierBySlug, {
    guildId,
    slug: tier.slug,
  });
  if (existing?._id) {
    return existing._id;
  }
  try {
    return await client.mutation(api.entitlements.createTier, {
      guildId,
      slug: tier.slug,
      name: tier.name,
      description: tier.description,
      displayPrice: tier.displayPrice,
      perks: tier.perks,
      sortOrder: tier.sortOrder,
      roleIds: DEFAULT_ROLE_IDS,
      entitlementPolicy: { kind: "subscription" },
      actorId: "playwright",
    });
  } catch (error) {
    const fallback = await client.query(api.entitlements.getTierBySlug, {
      guildId,
      slug: tier.slug,
    });
    if (fallback?._id) {
      return fallback._id;
    }
    throw error;
  }
};

export const ensureConvexTestData = async (): Promise<SeedResult> => {
  const client = new ConvexHttpClient(getConvexUrl());
  await waitForConvex(client);

  try {
    await client.query(api.entitlements.listPublicTiersByDiscordGuild, {
      discordGuildId: DEFAULT_DISCORD_GUILD_ID,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not find public function")
    ) {
      throw new Error(
        "Convex backend is running but missing entitlements functions. Stop the running Convex local backend and re-run Playwright so it can start a fresh backend.",
      );
    }
    throw error;
  }

  const guildId = await client.mutation(api.guilds.upsertGuild, {
    discordGuildId: DEFAULT_DISCORD_GUILD_ID,
    name: DEFAULT_GUILD_NAME,
    actorId: "playwright",
    actorType: "system",
  });

  for (const tier of DEFAULT_TIERS) {
    await ensureTier(client, guildId, tier);
  }

  return {
    guildId,
    discordGuildId: DEFAULT_DISCORD_GUILD_ID,
    tiers: DEFAULT_TIERS,
  };
};
