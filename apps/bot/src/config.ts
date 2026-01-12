import {
  optionalEnv,
  parseOptionalList,
  parsePositiveInt,
  requireEnv,
  requireUrl,
} from "./env.js";

export type BotConfig = {
  discordToken: string;
  convexUrl: string;
  syncIntervalMs: number;
  memberSyncDelayMs: number;
  guildAllowList?: string[];
  actorId: string;
};

export const loadConfig = (): BotConfig => {
  const discordToken = requireEnv("DISCORD_BOT_TOKEN");
  const convexUrl = requireUrl("CONVEX_URL");
  const syncIntervalMs = parsePositiveInt(
    optionalEnv("PERKCORD_SYNC_INTERVAL_MS"),
    15000,
    "PERKCORD_SYNC_INTERVAL_MS"
  );
  const memberSyncDelayMs = parsePositiveInt(
    optionalEnv("PERKCORD_MEMBER_SYNC_DELAY_MS"),
    0,
    "PERKCORD_MEMBER_SYNC_DELAY_MS"
  );

  const guildAllowList = parseOptionalList(optionalEnv("PERKCORD_GUILD_IDS"));
  const actorId = optionalEnv("PERKCORD_BOT_ACTOR_ID") || "perkcord_bot";

  return {
    discordToken,
    convexUrl,
    syncIntervalMs,
    memberSyncDelayMs,
    guildAllowList,
    actorId,
  };
};
