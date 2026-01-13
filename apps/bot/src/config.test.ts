import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const ORIGINAL_ENV = { ...process.env };

describe("bot config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DISCORD_BOT_TOKEN = "token";
    process.env.CONVEX_URL = "https://convex.example";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("loads config with defaults", () => {
    const config = loadConfig();
    expect(config.discordToken).toBe("token");
    expect(config.convexUrl).toBe("https://convex.example");
    expect(config.syncIntervalMs).toBe(15000);
    expect(config.memberSyncDelayMs).toBe(0);
    expect(config.guildAllowList).toBeUndefined();
    expect(config.actorId).toBe("perkcord_bot");
  });

  it("loads config with overrides", () => {
    process.env.PERKCORD_SYNC_INTERVAL_MS = "20000";
    process.env.PERKCORD_MEMBER_SYNC_DELAY_MS = "50";
    process.env.PERKCORD_GUILD_IDS = "1, 2, 2";
    process.env.PERKCORD_BOT_ACTOR_ID = "bot_actor";
    const config = loadConfig();
    expect(config.syncIntervalMs).toBe(20000);
    expect(config.memberSyncDelayMs).toBe(50);
    expect(config.guildAllowList).toEqual(["1", "2"]);
    expect(config.actorId).toBe("bot_actor");
  });
});
