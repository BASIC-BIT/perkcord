import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const instances: Array<{ url: string }> = [];

vi.mock("convex/browser", () => {
  class MockConvexHttpClient {
    url: string;
    query = queryMock;
    constructor(url: string) {
      this.url = url;
      instances.push({ url });
    }
  }
  return { ConvexHttpClient: MockConvexHttpClient };
});

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    entitlements: {
      listPublicTiersByDiscordGuild: "listPublicTiersByDiscordGuild",
      getPublicTierBySlug: "getPublicTierBySlug",
      getTierBySlug: "getTierBySlug",
    },
    guilds: {
      getGuildByDiscordId: "getGuildByDiscordId",
    },
  },
}));

import { fetchPublicTierBySlug, fetchPublicTiers, fetchTierForCheckout } from "./tierCatalog";

describe("tierCatalog", () => {
  beforeEach(() => {
    queryMock.mockReset();
    instances.length = 0;
    process.env.CONVEX_URL = "http://convex.local";
  });

  it("fetches public tiers by guild", async () => {
    const tiers = [{ id: "tier1" }];
    queryMock.mockResolvedValueOnce(tiers);
    const result = await fetchPublicTiers("guild123");
    expect(result).toEqual(tiers);
    expect(queryMock).toHaveBeenCalledWith("listPublicTiersByDiscordGuild", {
      discordGuildId: "guild123",
    });
    expect(instances[0]?.url).toBe("http://convex.local");
  });

  it("fetches a public tier by slug", async () => {
    queryMock.mockResolvedValueOnce({ id: "tier2" });
    const result = await fetchPublicTierBySlug("guild123", "vip");
    expect(result).toEqual({ id: "tier2" });
    expect(queryMock).toHaveBeenCalledWith("getPublicTierBySlug", {
      discordGuildId: "guild123",
      slug: "vip",
    });
  });

  it("fetches tier for checkout when guild exists", async () => {
    queryMock.mockResolvedValueOnce({ _id: "guild-id" }).mockResolvedValueOnce({ _id: "tier-id" });
    const result = await fetchTierForCheckout("guild123", "vip");
    expect(result).toEqual({ _id: "tier-id" });
    expect(queryMock).toHaveBeenCalledWith("getGuildByDiscordId", {
      discordGuildId: "guild123",
    });
    expect(queryMock).toHaveBeenCalledWith("getTierBySlug", {
      guildId: "guild-id",
      slug: "vip",
    });
  });

  it("returns null when guild is missing", async () => {
    queryMock.mockResolvedValueOnce(null);
    const result = await fetchTierForCheckout("guild123", "vip");
    expect(result).toBeNull();
  });
});
