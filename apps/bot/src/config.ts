const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Expected a positive integer, got ${value}.`);
  }
  return parsed;
};

const parseOptionalList = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? Array.from(new Set(entries)) : undefined;
};

export type BotConfig = {
  discordToken: string;
  convexUrl: string;
  syncIntervalMs: number;
  memberSyncDelayMs: number;
  guildAllowList?: string[];
  actorId: string;
};

export const loadConfig = (): BotConfig => {
  const discordToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!discordToken) {
    throw new Error("DISCORD_BOT_TOKEN is required.");
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  if (!convexUrl) {
    throw new Error("CONVEX_URL is required.");
  }

  const syncIntervalMs = parsePositiveInt(
    process.env.PERKCORD_SYNC_INTERVAL_MS,
    15000
  );
  const memberSyncDelayMs = parsePositiveInt(
    process.env.PERKCORD_MEMBER_SYNC_DELAY_MS,
    0
  );

  const guildAllowList = parseOptionalList(process.env.PERKCORD_GUILD_IDS);
  const actorId = process.env.PERKCORD_BOT_ACTOR_ID?.trim() || "perkcord_bot";

  return {
    discordToken,
    convexUrl,
    syncIntervalMs,
    memberSyncDelayMs,
    guildAllowList,
    actorId,
  };
};
