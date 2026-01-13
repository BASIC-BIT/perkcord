import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig } from "./config.js";
import { createConvexClient } from "./convex.js";
import { RoleSyncWorker } from "./roleSyncWorker.js";

const config = loadConfig();
const convex = createConvexClient(config.convexUrl);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const worker = new RoleSyncWorker({
  client,
  convex,
  config,
});

client.once("clientReady", async () => {
  console.log("Perkcord bot connected.");
  await worker.bootstrapGuilds();
  worker.start();
});

client.on("guildCreate", async (guild) => {
  await worker.registerGuild(guild);
});

client.on("error", (error) => {
  console.error("Discord client error", error);
});

process.on("SIGINT", async () => {
  console.log("Perkcord bot shutting down.");
  worker.stop();
  await client.destroy();
  process.exit(0);
});

client.login(config.discordToken).catch((error) => {
  console.error("Failed to login to Discord", error);
  process.exit(1);
});
