import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const BOOLEAN_EQUAL = 7;
const INTEGER_GREATER_THAN_OR_EQUAL = 2;

const roleConnectionMetadata = [
  {
    key: "is_active",
    name: "Active membership",
    description: "Member has an active entitlement.",
    type: BOOLEAN_EQUAL,
  },
  {
    key: "tier",
    name: "Tier",
    description: "Numeric access tier.",
    type: INTEGER_GREATER_THAN_OR_EQUAL,
  },
  {
    key: "member_since_days",
    name: "Member since (days)",
    description: "Days since the member first gained access.",
    type: INTEGER_GREATER_THAN_OR_EQUAL,
  },
];

const getDiscordConfig = () => {
  const applicationId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!applicationId) {
    throw new Error("DISCORD_CLIENT_ID is not configured.");
  }
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }
  return { applicationId, botToken };
};

const extractDiscordError = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message : undefined;
  const code =
    typeof record.code === "number" || typeof record.code === "string"
      ? record.code
      : undefined;
  if (!message && !code) {
    return null;
  }
  return { message, code };
};

export const registerRoleConnectionMetadata = action({
  args: {
    guildId: v.optional(v.id("guilds")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { applicationId, botToken } = getDiscordConfig();
    const response = await fetch(
      `https://discord.com/api/v10/applications/${applicationId}/role-connections/metadata`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify(roleConnectionMetadata),
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const details = extractDiscordError(payload);
      const suffix =
        details?.message || details?.code
          ? ` (${details?.code ?? "error"}: ${details?.message ?? "Unknown error"})`
          : "";
      throw new Error(
        `Discord metadata registration failed with status ${response.status}${suffix}.`
      );
    }

    if (args.guildId) {
      await ctx.runMutation(api.auditEvents.recordAuditEvent, {
        guildId: args.guildId,
        actorType: args.actorId ? "admin" : "system",
        actorId: args.actorId,
        eventType: "role_connections.metadata_registered",
        payloadJson: JSON.stringify({
          applicationId,
          keys: roleConnectionMetadata.map((entry) => entry.key),
        }),
      });
    }

    return {
      applicationId,
      metadataCount: roleConnectionMetadata.length,
      metadataKeys: roleConnectionMetadata.map((entry) => entry.key),
      metadata: payload,
      registeredAt: Date.now(),
    };
  },
});
