import type { Client, Guild, GuildMember } from "discord.js";
import { PermissionsBitField } from "discord.js";
import type { ConvexHttpClient } from "convex/browser";
import type { BotConfig } from "./config.js";

type RoleSyncRequest = {
  _id: string;
  scope: "guild" | "user";
  discordUserId?: string;
};

type DesiredRoles = {
  desiredRoleIds: string[];
};

type Tier = {
  roleIds: string[];
};

type WorkerOptions = {
  client: Client;
  convex: ConvexHttpClient;
  config: BotConfig;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const getRetryAfterMs = (error: unknown): number | null => {
  const record = asRecord(error);
  if (!record) {
    return null;
  }
  const rawError = asRecord(record["rawError"]);
  const retryAfterSeconds = readNumber(rawError?.["retry_after"]);
  if (retryAfterSeconds !== null) {
    return Math.max(0, retryAfterSeconds * 1000);
  }
  const retryAfterMs = readNumber(record["retryAfter"]);
  if (retryAfterMs !== null) {
    return Math.max(0, retryAfterMs);
  }
  return null;
};

const getStatusCode = (error: unknown): number | null => {
  const record = asRecord(error);
  return record ? readNumber(record["status"]) : null;
};

const getErrorCode = (error: unknown): string | number | null => {
  const record = asRecord(error);
  if (!record) {
    return null;
  }
  const code = record["code"];
  if (typeof code === "string" || typeof code === "number") {
    return code;
  }
  return null;
};

const isRetryableDiscordError = (error: unknown): boolean => {
  const status = getStatusCode(error);
  if (status === 429 || (status !== null && status >= 500)) {
    return true;
  }
  const code = getErrorCode(error);
  if (typeof code === "string") {
    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENOTFOUND",
    ].includes(code);
  }
  const message = readString(asRecord(error)?.["message"]);
  if (message && message.toLowerCase().includes("rate limit")) {
    return true;
  }
  return false;
};

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return `Error: ${String(error)}`;
};

export class RoleSyncWorker {
  private readonly client: Client;
  private readonly convex: ConvexHttpClient;
  private readonly config: BotConfig;
  private readonly convexGuildIdByDiscordId = new Map<string, string>();
  private readonly guildByConvexId = new Map<string, Guild>();
  private readonly retryMaxAttempts = 3;
  private readonly retryBaseDelayMs = 1000;
  private readonly retryMaxDelayMs = 15000;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(options: WorkerOptions) {
    this.client = options.client;
    this.convex = options.convex;
    this.config = options.config;
  }

  async bootstrapGuilds() {
    const guilds = await this.client.guilds.fetch();
    for (const [, guildPreview] of guilds) {
      const guild = await guildPreview.fetch();
      await this.registerGuild(guild);
    }
  }

  async registerGuild(guild: Guild) {
    if (
      this.config.guildAllowList &&
      !this.config.guildAllowList.includes(guild.id)
    ) {
      return;
    }

    const convexGuildId = (await this.convex.mutation("guilds:upsertGuild", {
      discordGuildId: guild.id,
      name: guild.name,
      actorType: "system",
      actorId: this.config.actorId,
    })) as string;

    this.convexGuildIdByDiscordId.set(guild.id, convexGuildId);
    this.guildByConvexId.set(convexGuildId, guild);

    await this.updateDiagnostics(guild, convexGuildId);
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.syncIntervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const [convexGuildId, guild] of this.guildByConvexId.entries()) {
        await this.handleGuildTick(guild, convexGuildId);
      }
    } finally {
      this.running = false;
    }
  }

  private async handleGuildTick(guild: Guild, convexGuildId: string) {
    const request = (await this.convex.mutation(
      "roleSync:claimNextRoleSyncRequest",
      {
        guildId: convexGuildId,
        actorId: this.config.actorId,
        actorType: "system",
      }
    )) as RoleSyncRequest | null;

    if (!request) {
      return;
    }

    await this.processRequest(guild, convexGuildId, request);
  }

  private async processRequest(
    guild: Guild,
    convexGuildId: string,
    request: RoleSyncRequest
  ) {
    try {
      if (request.scope === "guild") {
        await this.syncGuild(guild, convexGuildId);
      } else {
        if (!request.discordUserId) {
          throw new Error("Missing discordUserId for role sync request.");
        }
        await this.syncMember(guild, convexGuildId, request.discordUserId);
      }

      await this.convex.mutation("roleSync:completeRoleSyncRequest", {
        requestId: request._id,
        status: "completed",
        actorId: this.config.actorId,
        actorType: "system",
      });
    } catch (error) {
      await this.convex.mutation("roleSync:completeRoleSyncRequest", {
        requestId: request._id,
        status: "failed",
        lastError: formatError(error),
        actorId: this.config.actorId,
        actorType: "system",
      });
    }
  }

  private async syncGuild(guild: Guild, convexGuildId: string) {
    const managedRoleIds = await this.fetchManagedRoleIds(convexGuildId);
    if (managedRoleIds.size === 0) {
      return;
    }

    const members = await guild.members.fetch();
    for (const member of members.values()) {
      await this.syncMemberWithRoles(
        guild,
        convexGuildId,
        member,
        managedRoleIds
      );
      if (this.config.memberSyncDelayMs > 0) {
        await sleep(this.config.memberSyncDelayMs);
      }
    }
  }

  private async syncMember(
    guild: Guild,
    convexGuildId: string,
    discordUserId: string
  ) {
    const managedRoleIds = await this.fetchManagedRoleIds(convexGuildId);
    if (managedRoleIds.size === 0) {
      return;
    }

    const member = await guild.members.fetch(discordUserId);
    await this.syncMemberWithRoles(
      guild,
      convexGuildId,
      member,
      managedRoleIds
    );
  }

  private async syncMemberWithRoles(
    guild: Guild,
    convexGuildId: string,
    member: GuildMember,
    managedRoleIds: Set<string>
  ) {
    const desired = (await this.convex.query("roleSync:getDesiredRolesForMember", {
      guildId: convexGuildId,
      discordUserId: member.id,
    })) as DesiredRoles;

    await this.applyRoleDelta(guild, member, managedRoleIds, desired.desiredRoleIds);
  }

  private async applyRoleDelta(
    guild: Guild,
    member: GuildMember,
    managedRoleIds: Set<string>,
    desiredRoleIds: string[]
  ) {
    const desiredSet = new Set(desiredRoleIds);
    const currentManaged = new Set(
      member.roles.cache
        .map((role) => role.id)
        .filter((roleId) => managedRoleIds.has(roleId))
    );

    const rolesToAdd = desiredRoleIds.filter(
      (roleId) => !member.roles.cache.has(roleId)
    );
    const rolesToRemove = Array.from(currentManaged).filter(
      (roleId) => !desiredSet.has(roleId) && roleId !== guild.id
    );

    if (rolesToAdd.length > 0) {
      await this.runWithRetry(
        () => member.roles.add(rolesToAdd, "Perkcord role sync"),
        `add roles for ${member.id}`
      );
    }

    if (rolesToRemove.length > 0) {
      await this.runWithRetry(
        () => member.roles.remove(rolesToRemove, "Perkcord role sync"),
        `remove roles for ${member.id}`
      );
    }
  }

  private async runWithRetry<T>(operation: () => Promise<T>, context: string) {
    let attempt = 0;
    let lastError: unknown = null;
    while (attempt < this.retryMaxAttempts) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const delayMs = this.getRetryDelayMs(error, attempt);
        if (delayMs === null || attempt >= this.retryMaxAttempts) {
          throw error;
        }
        console.warn(
          `Role sync ${context} failed (attempt ${attempt}/${this.retryMaxAttempts}). Retrying in ${Math.round(
            delayMs
          )}ms.`
        );
        await sleep(delayMs);
      }
    }
    throw lastError ?? new Error("Role sync retry attempts exhausted.");
  }

  private getRetryDelayMs(error: unknown, attempt: number): number | null {
    const retryAfterMs = getRetryAfterMs(error);
    if (retryAfterMs !== null && retryAfterMs > 0) {
      return Math.min(retryAfterMs, this.retryMaxDelayMs);
    }
    if (!isRetryableDiscordError(error)) {
      return null;
    }
    const baseDelay = Math.min(
      this.retryBaseDelayMs * Math.pow(2, attempt - 1),
      this.retryMaxDelayMs
    );
    const jitter = baseDelay * 0.2 * Math.random();
    return baseDelay + jitter;
  }

  private async fetchManagedRoleIds(convexGuildId: string) {
    const tiers = (await this.convex.query("entitlements:listTiers", {
      guildId: convexGuildId,
    })) as Tier[];

    const managedRoleIds = new Set<string>();
    for (const tier of tiers) {
      for (const roleId of tier.roleIds) {
        managedRoleIds.add(roleId);
      }
    }

    return managedRoleIds;
  }

  private async updateDiagnostics(guild: Guild, convexGuildId: string) {
    await guild.roles.fetch();
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const botRole = botMember.roles.highest ?? null;

    const missingPermissions: string[] = [];
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      missingPermissions.push("MANAGE_ROLES");
    }

    const managedRoleIds = await this.fetchManagedRoleIds(convexGuildId);
    const checkedRoleIds = Array.from(managedRoleIds);
    const missingRoleIds: string[] = [];
    const blockedRoleIds: string[] = [];

    for (const roleId of managedRoleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        missingRoleIds.push(roleId);
        continue;
      }
      if (botRole && role.id !== botRole.id && botRole.position <= role.position) {
        blockedRoleIds.push(roleId);
      }
    }

    await this.convex.mutation("diagnostics:upsertGuildDiagnostics", {
      guildId: convexGuildId,
      checkedAt: Date.now(),
      botUserId: botMember.id,
      botRoleId: botRole?.id,
      missingPermissions,
      blockedRoleIds,
      missingRoleIds,
      checkedRoleIds,
      actorType: "system",
      actorId: this.config.actorId,
    });
  }
}
