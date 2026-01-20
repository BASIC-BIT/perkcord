import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { unstable_noStore as noStore } from "next/cache";
import { api } from "../../../convex/_generated/api";
import { requireEnv } from "./serverEnv";

export type GuildSummary = {
  _id: string;
  discordGuildId: string;
  name: string;
};

export const fetchGuilds = async (limit = 100): Promise<GuildSummary[]> => {
  noStore();
  const url = requireEnv("CONVEX_URL", "CONVEX_URL is not configured.");
  const convex = new ConvexHttpClient(url);
  const guilds = await convex.query(api.guilds.listGuilds, { limit });
  return guilds.map((guild) => ({
    _id: guild._id,
    discordGuildId: guild.discordGuildId,
    name: guild.name,
  }));
};
