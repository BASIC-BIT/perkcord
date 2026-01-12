import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
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

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const OAUTH_ENCRYPTION_ENV = "PERKCORD_OAUTH_ENCRYPTION_KEY";
const IV_LENGTH = 12;

const activeGrantStatuses: Doc<"entitlementGrants">["status"][] = [
  "active",
  "past_due",
];

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const encodeBase64Url = (value: Buffer) => value.toString("base64url");

const getEncryptionKey = () => {
  const raw = process.env[OAUTH_ENCRYPTION_ENV]?.trim();
  if (!raw) {
    throw new Error(`${OAUTH_ENCRYPTION_ENV} is not configured.`);
  }
  const key = decodeBase64Url(raw);
  if (key.length !== 32) {
    throw new Error(
      `${OAUTH_ENCRYPTION_ENV} must be a base64-encoded 32-byte key.`
    );
  }
  return key;
};

const encryptSecret = (value: string) => {
  if (!value) {
    throw new Error("Cannot encrypt an empty value.");
  }
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}.${encodeBase64Url(
    tag
  )}`;
};

const decryptSecret = (payload: string) => {
  const [ivEncoded, dataEncoded, tagEncoded] = payload.split(".");
  if (!ivEncoded || !dataEncoded || !tagEncoded) {
    throw new Error("Invalid encrypted payload format.");
  }
  const key = getEncryptionKey();
  const iv = decodeBase64Url(ivEncoded);
  const data = decodeBase64Url(dataEncoded);
  const tag = decodeBase64Url(tagEncoded);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
};

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

const getDiscordOAuthConfig = () => {
  const applicationId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!applicationId) {
    throw new Error("DISCORD_CLIENT_ID is not configured.");
  }
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new Error("DISCORD_CLIENT_SECRET is not configured.");
  }
  const memberRedirectUri = process.env.DISCORD_MEMBER_REDIRECT_URI?.trim();
  if (!memberRedirectUri) {
    throw new Error("DISCORD_MEMBER_REDIRECT_URI is not configured.");
  }
  return { applicationId, clientSecret, memberRedirectUri };
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

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 25;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 100);
};

const isGrantEffective = (grant: Doc<"entitlementGrants">, now: number) => {
  if (!activeGrantStatuses.includes(grant.status)) {
    return false;
  }
  if (grant.validFrom > now) {
    return false;
  }
  if (grant.validThrough !== undefined && grant.validThrough < now) {
    return false;
  }
  return true;
};

type DiscordTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

const refreshDiscordToken = async (
  refreshToken: string,
  config: ReturnType<typeof getDiscordOAuthConfig>
): Promise<DiscordTokenResponse> => {
  const body = new URLSearchParams({
    client_id: config.applicationId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: config.memberRedirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Discord OAuth token.");
  }

  return (await response.json()) as DiscordTokenResponse;
};

const upsertRoleConnection = async (
  accessToken: string,
  applicationId: string,
  payload: Record<string, unknown>
) => {
  const response = await fetch(
    `https://discord.com/api/v10/users/@me/applications/${applicationId}/role-connection`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const responsePayload = await response.json().catch(() => null);
  if (!response.ok) {
    const details = extractDiscordError(responsePayload);
    const suffix =
      details?.message || details?.code
        ? ` (${details?.code ?? "error"}: ${details?.message ?? "Unknown error"})`
        : "";
    throw new Error(
      `Discord role connection update failed with status ${response.status}${suffix}.`
    );
  }

  return responsePayload;
};

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const ROLE_CONNECTION_PLATFORM_NAME = "Perkcord";

export const getRoleConnectionState = query({
  args: {
    guildId: v.id("guilds"),
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const discordUserId = args.discordUserId.trim();
    if (!discordUserId) {
      throw new Error("discordUserId is required for role connection sync.");
    }
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for role connection sync.");
    }

    const memberIdentity = await ctx.db
      .query("memberIdentities")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId)
      )
      .unique();

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId)
      )
      .collect();

    const now = Date.now();
    const activeGrants = grants.filter((grant) => isGrantEffective(grant, now));

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();
    tiers.sort((a, b) => a.name.localeCompare(b.name));
    const tierRank = new Map(tiers.map((tier, index) => [tier._id, index + 1]));

    let activeTier = 0;
    for (const grant of activeGrants) {
      const rank = tierRank.get(grant.tierId) ?? 0;
      if (rank > activeTier) {
        activeTier = rank;
      }
    }

    let earliestGrant: number | null = null;
    for (const grant of grants) {
      if (earliestGrant === null || grant.validFrom < earliestGrant) {
        earliestGrant = grant.validFrom;
      }
    }

    const memberSinceDays =
      earliestGrant === null
        ? 0
        : Math.max(0, Math.floor((now - earliestGrant) / DAY_MS));

    return {
      memberIdentity,
      isActive: activeGrants.length > 0,
      tier: activeTier,
      memberSinceDays,
      evaluatedAt: now,
    };
  },
});

export const claimNextRoleConnectionUpdate = mutation({
  args: {
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error(
        "Only system actors can claim role connection update requests."
      );
    }

    const [nextUpdate] = await ctx.db
      .query("roleConnectionUpdates")
      .withIndex("by_status_time", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(1);

    if (!nextUpdate) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(nextUpdate._id, {
      status: "in_progress",
      updatedAt: now,
    });

    return {
      ...nextUpdate,
      status: "in_progress" as Doc<"roleConnectionUpdates">["status"],
      updatedAt: now,
    };
  },
});

export const completeRoleConnectionUpdate = mutation({
  args: {
    updateId: v.id("roleConnectionUpdates"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    lastError: v.optional(v.string()),
    actorId: v.string(),
    actorType,
  },
  handler: async (ctx, args) => {
    const requestActorType = args.actorType ?? "system";
    if (requestActorType !== "system") {
      throw new Error(
        "Only system actors can complete role connection update requests."
      );
    }

    const update = await ctx.db.get(args.updateId);
    if (!update) {
      throw new Error("Role connection update not found.");
    }

    if (update.status === "completed" || update.status === "failed") {
      return args.updateId;
    }

    const status = args.status;
    const lastError = args.lastError?.trim();
    if (status === "failed" && !lastError) {
      throw new Error("lastError is required when marking update as failed.");
    }
    if (status === "completed" && lastError) {
      throw new Error("lastError is only allowed for failed updates.");
    }

    const now = Date.now();
    const patch: Partial<Doc<"roleConnectionUpdates">> = {
      status,
      updatedAt: now,
      completedAt: now,
    };
    if (status === "failed") {
      patch.lastError = lastError;
    } else {
      patch.lastError = undefined;
    }

    await ctx.db.patch(args.updateId, patch);
    return args.updateId;
  },
});

export const processRoleConnectionUpdates = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const results: Array<{
      updateId: string;
      status: "completed" | "failed";
      reason?: string;
    }> = [];
    const config = getDiscordOAuthConfig();

    for (let index = 0; index < limit; index += 1) {
      const update = await ctx.runMutation(
        api.discordRoleConnections.claimNextRoleConnectionUpdate,
        {
          actorId: "role_connections_worker",
          actorType: "system",
        }
      );

      if (!update) {
        break;
      }

      try {
        const state = await ctx.runQuery(
          api.discordRoleConnections.getRoleConnectionState,
          {
            guildId: update.guildId,
            discordUserId: update.discordUserId,
          }
        );

        const oauth = state.memberIdentity?.oauth;
        if (!oauth) {
          throw new Error("Member OAuth tokens are missing.");
        }

        let accessToken = decryptSecret(oauth.accessTokenEnc);
        let refreshToken = decryptSecret(oauth.refreshTokenEnc);
        let expiresAt = oauth.expiresAt;
        const now = Date.now();

        if (
          !Number.isFinite(expiresAt) ||
          expiresAt - now < TOKEN_REFRESH_BUFFER_MS
        ) {
          const refreshed = await refreshDiscordToken(refreshToken, config);
          if (!Number.isFinite(refreshed.expires_in)) {
            throw new Error("Discord token refresh response missing expiry.");
          }
          accessToken = refreshed.access_token;
          refreshToken = refreshed.refresh_token ?? refreshToken;
          expiresAt = now + refreshed.expires_in * 1000;

          await ctx.runMutation(api.members.upsertMemberIdentity, {
            guildId: update.guildId,
            discordUserId: update.discordUserId,
            oauth: {
              accessTokenEnc: encryptSecret(accessToken),
              refreshTokenEnc: encryptSecret(refreshToken),
              expiresAt,
            },
            actorType: "system",
            actorId: "role_connections_refresh",
          });
        }

        const platformUsername =
          state.memberIdentity?.discordUsername?.trim() ||
          update.discordUserId;
        const payload = {
          platform_name: ROLE_CONNECTION_PLATFORM_NAME,
          platform_username: platformUsername,
          metadata: {
            is_active: state.isActive ? "1" : "0",
            tier: String(state.tier),
            member_since_days: String(state.memberSinceDays),
          },
        };

        await upsertRoleConnection(accessToken, config.applicationId, payload);

        await ctx.runMutation(
          api.discordRoleConnections.completeRoleConnectionUpdate,
          {
            updateId: update._id,
            status: "completed",
            actorId: "role_connections_worker",
            actorType: "system",
          }
        );

        results.push({ updateId: update._id, status: "completed" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error.";
        await ctx.runMutation(
          api.discordRoleConnections.completeRoleConnectionUpdate,
          {
            updateId: update._id,
            status: "failed",
            lastError: message,
            actorId: "role_connections_worker",
            actorType: "system",
          }
        );
        results.push({
          updateId: update._id,
          status: "failed",
          reason: message,
        });
      }
    }

    return {
      evaluatedAt: Date.now(),
      processedCount: results.filter((item) => item.status === "completed")
        .length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  },
});

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
