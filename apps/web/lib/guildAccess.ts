import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { fetchDiscordGuilds } from "./discordOAuth";
import { decodeDiscordAccessToken, isDiscordAccessTokenExpired } from "./discordTokens";
import { fetchGuilds, type GuildSummary } from "./guildCatalog";

type GuildAccessResult = {
  guilds: GuildSummary[] | null;
  error: string | null;
};

export const resolveAllowedGuilds = async (
  tokenValue: string | null,
): Promise<GuildAccessResult> => {
  noStore();
  if (!tokenValue) {
    return { guilds: null, error: "Connect Discord to see your servers." };
  }

  const token = decodeDiscordAccessToken(tokenValue);
  if (!token || isDiscordAccessTokenExpired(token)) {
    return { guilds: null, error: "Discord session expired. Reconnect to continue." };
  }

  try {
    const [discordGuilds, convexGuilds] = await Promise.all([
      fetchDiscordGuilds(token.accessToken),
      fetchGuilds(),
    ]);
    const discordIds = new Set(discordGuilds.map((guild) => guild.id));
    const allowed = convexGuilds.filter((guild) =>
      discordIds.has(guild.discordGuildId),
    );
    return { guilds: allowed, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load guild list.";
    return { guilds: null, error: message };
  }
};
