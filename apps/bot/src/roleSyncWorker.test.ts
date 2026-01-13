import type { ConvexHttpClient } from "convex/browser";
import type { Client, Guild } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotConfig } from "./config";
import { RoleSyncWorker } from "./roleSyncWorker";

type RoleCache = {
  has: (roleId: string) => boolean;
  map: <T>(fn: (role: { id: string }) => T) => T[];
};

type WorkerPrivate = Record<string, unknown>;

const asPrivate = (worker: RoleSyncWorker): WorkerPrivate => worker as unknown as WorkerPrivate;

const asSpyTarget = (worker: RoleSyncWorker): Record<string, (...args: unknown[]) => unknown> =>
  worker as unknown as Record<string, (...args: unknown[]) => unknown>;

const createRoleCache = (roleIds: string[]): RoleCache => ({
  has: (roleId) => roleIds.includes(roleId),
  map: (fn) => roleIds.map((id) => fn({ id })),
});

const makeMember = (roleIds: string[]) => ({
  id: "member",
  roles: {
    cache: createRoleCache(roleIds),
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
});

const makeWorker = (overrides?: { config?: Partial<BotConfig> }) => {
  const convex = {
    query: vi.fn(),
    mutation: vi.fn(),
  };
  const client = {
    guilds: {
      fetch: vi.fn(),
    },
  };
  const config = {
    discordToken: "token",
    convexUrl: "https://convex.example",
    syncIntervalMs: 1000,
    memberSyncDelayMs: 0,
    actorId: "tester",
    ...overrides?.config,
  };
  const worker = new RoleSyncWorker({
    client: client as unknown as Client,
    convex: convex as unknown as ConvexHttpClient,
    config,
  });
  return { worker, convex, client };
};

describe("RoleSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("skips registering guilds outside allow list", async () => {
    const { worker, convex } = makeWorker({
      config: { guildAllowList: ["allowed"] },
    });
    await worker.registerGuild({ id: "blocked" } as unknown as Guild);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("bootstraps guilds and registers each", async () => {
    const { worker, client } = makeWorker();
    const previewA = { fetch: vi.fn().mockResolvedValue({ id: "guildA" }) };
    const previewB = { fetch: vi.fn().mockResolvedValue({ id: "guildB" }) };
    client.guilds.fetch.mockResolvedValue(
      new Map([
        ["a", previewA],
        ["b", previewB],
      ]),
    );
    const registerSpy = vi.spyOn(worker, "registerGuild").mockResolvedValue(undefined);
    await worker.bootstrapGuilds();
    expect(registerSpy).toHaveBeenCalledTimes(2);
  });

  it("registers guilds and stores mappings", async () => {
    const { worker, convex } = makeWorker();
    vi.spyOn(asSpyTarget(worker), "updateDiagnostics").mockResolvedValue(undefined);
    convex.mutation.mockResolvedValue("convexGuildId");
    const guild = { id: "guild1", name: "Guild One" };
    await worker.registerGuild(guild as unknown as Guild);
    expect(convex.mutation).toHaveBeenCalled();
    expect(
      (asPrivate(worker)["convexGuildIdByDiscordId"] as Map<string, string>).get("guild1"),
    ).toBe("convexGuildId");
    expect(
      (asPrivate(worker)["guildByConvexId"] as Map<string, unknown>).get("convexGuildId"),
    ).toBe(guild);
  });

  it("starts and stops timers safely", async () => {
    const { worker } = makeWorker();
    const tickSpy = vi.spyOn(asSpyTarget(worker), "tick").mockResolvedValue(undefined);
    worker.start();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(tickSpy).toHaveBeenCalledTimes(2);
    worker.start();
    vi.advanceTimersByTime(1000);
    expect(tickSpy).toHaveBeenCalledTimes(3);
    worker.stop();
    vi.advanceTimersByTime(1000);
    expect(tickSpy).toHaveBeenCalledTimes(3);
  });

  it("skips ticks when already running", async () => {
    const { worker } = makeWorker();
    const handleSpy = vi.spyOn(asSpyTarget(worker), "handleGuildTick").mockResolvedValue(undefined);
    (asPrivate(worker)["running"] as boolean) = true;
    await (asPrivate(worker)["tick"] as () => Promise<void>)();
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it("ticks through registered guilds", async () => {
    const { worker } = makeWorker();
    const handleSpy = vi.spyOn(asSpyTarget(worker), "handleGuildTick").mockResolvedValue(undefined);
    (asPrivate(worker)["guildByConvexId"] as Map<string, { id: string }>).set("convex-id", {
      id: "guild",
    });
    await (asPrivate(worker)["tick"] as () => Promise<void>)();
    expect(handleSpy).toHaveBeenCalledWith({ id: "guild" }, "convex-id");
  });

  it("processes queued role sync requests", async () => {
    const { worker, convex } = makeWorker();
    convex.mutation.mockResolvedValueOnce({
      _id: "req",
      scope: "guild",
    });
    const processSpy = vi.spyOn(asSpyTarget(worker), "processRequest").mockResolvedValue(undefined);
    await (
      asPrivate(worker)["handleGuildTick"] as (
        guild: { id: string },
        guildId: string,
      ) => Promise<void>
    )({ id: "guild" }, "guild-id");
    expect(processSpy).toHaveBeenCalled();
  });

  it("returns early when no queued role sync request exists", async () => {
    const { worker, convex } = makeWorker();
    convex.mutation.mockResolvedValueOnce(null);
    const processSpy = vi.spyOn(asSpyTarget(worker), "processRequest").mockResolvedValue(undefined);
    await (
      asPrivate(worker)["handleGuildTick"] as (
        guild: { id: string },
        guildId: string,
      ) => Promise<void>
    )({ id: "guild" }, "guild-id");
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("marks role sync requests as completed on success", async () => {
    const { worker, convex } = makeWorker();
    vi.spyOn(asSpyTarget(worker), "syncGuild").mockResolvedValue(undefined);
    await (
      asPrivate(worker)["processRequest"] as (
        guild: { id: string },
        guildId: string,
        request: { _id: string; scope: "guild" },
      ) => Promise<void>
    )({ id: "guild" }, "guild-id", {
      _id: "req",
      scope: "guild",
    });
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: "req",
        status: "completed",
      }),
    );
  });

  it("handles user-scoped role sync requests", async () => {
    const { worker, convex } = makeWorker();
    vi.spyOn(asSpyTarget(worker), "syncMember").mockResolvedValue(undefined);
    await (
      asPrivate(worker)["processRequest"] as (
        guild: { id: string },
        guildId: string,
        request: { _id: string; scope: "user"; discordUserId: string },
      ) => Promise<void>
    )({ id: "guild" }, "guild-id", {
      _id: "req",
      scope: "user",
      discordUserId: "user",
    });
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: "req",
        status: "completed",
      }),
    );
  });

  it("formats non-error failures when processing requests", async () => {
    const { worker, convex } = makeWorker();
    vi.spyOn(asSpyTarget(worker), "syncGuild").mockRejectedValue("boom");
    await (
      asPrivate(worker)["processRequest"] as (
        guild: { id: string },
        guildId: string,
        request: { _id: string; scope: "guild" },
      ) => Promise<void>
    )({ id: "guild" }, "guild-id", {
      _id: "req",
      scope: "guild",
    });
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: "req",
        status: "failed",
        lastError: "Error: boom",
      }),
    );
  });

  it("applies role deltas for managed roles", async () => {
    const { worker } = makeWorker();
    const member = makeMember(["roleB", "roleC"]);
    const guild = { id: "guild1" };
    await (
      asPrivate(worker)["applyRoleDelta"] as (
        guild: { id: string },
        member: ReturnType<typeof makeMember>,
        managed: Set<string>,
        desired: string[],
      ) => Promise<void>
    )(guild, member, new Set(["roleA", "roleB"]), ["roleA"]);
    expect(member.roles.add).toHaveBeenCalledWith(["roleA"], "Perkcord role sync");
    expect(member.roles.remove).toHaveBeenCalledWith(["roleB"], "Perkcord role sync");
  });

  it("does not remove the guild @everyone role", async () => {
    const { worker } = makeWorker();
    const member = makeMember(["guild1"]);
    const guild = { id: "guild1" };
    await (
      asPrivate(worker)["applyRoleDelta"] as (
        guild: { id: string },
        member: ReturnType<typeof makeMember>,
        managed: Set<string>,
        desired: string[],
      ) => Promise<void>
    )(guild, member, new Set(["guild1"]), []);
    expect(member.roles.remove).not.toHaveBeenCalled();
  });

  it("short-circuits when no role changes are needed", async () => {
    const { worker } = makeWorker();
    const member = makeMember(["roleA"]);
    const guild = { id: "guild1" };
    await (
      asPrivate(worker)["applyRoleDelta"] as (
        guild: { id: string },
        member: ReturnType<typeof makeMember>,
        managed: Set<string>,
        desired: string[],
      ) => Promise<void>
    )(guild, member, new Set(["roleA"]), ["roleA"]);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(member.roles.remove).not.toHaveBeenCalled();
  });

  it("retries retryable discord errors", async () => {
    const { worker } = makeWorker();
    const op = vi.fn().mockRejectedValueOnce({ status: 500 }).mockResolvedValue("ok");
    const promise = (
      asPrivate(worker)["runWithRetry"] as (
        op: () => Promise<string>,
        context: string,
      ) => Promise<string>
    )(op, "test");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("fails fast on non-retryable errors", async () => {
    const { worker } = makeWorker();
    const op = vi.fn().mockRejectedValue({ status: 400 });
    await expect(
      (
        asPrivate(worker)["runWithRetry"] as (
          op: () => Promise<string>,
          context: string,
        ) => Promise<string>
      )(op, "test"),
    ).rejects.toBeDefined();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("syncs member roles using desired roles", async () => {
    const { worker, convex } = makeWorker();
    const member = makeMember([]);
    const guild = { id: "guild1" };
    const applySpy = vi.spyOn(asSpyTarget(worker), "applyRoleDelta").mockResolvedValue(undefined);
    convex.query.mockResolvedValueOnce({ desiredRoleIds: ["roleA"] });
    await (
      asPrivate(worker)["syncMemberWithRoles"] as (
        guild: { id: string },
        guildId: string,
        member: ReturnType<typeof makeMember>,
        managed: Set<string>,
      ) => Promise<void>
    )(guild, "guild-id", member, new Set(["roleA"]));
    expect(convex.query).toHaveBeenCalled();
    expect(applySpy).toHaveBeenCalledWith(guild, member, new Set(["roleA"]), ["roleA"]);
  });

  it("syncs a guild by iterating members", async () => {
    const { worker } = makeWorker({ config: { memberSyncDelayMs: 0 } });
    const memberA = makeMember(["roleA"]);
    const memberB = makeMember(["roleB"]);
    const guild = {
      id: "guild1",
      members: {
        fetch: vi.fn().mockResolvedValue(
          new Map([
            ["a", memberA],
            ["b", memberB],
          ]),
        ),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(
      new Set(["roleA", "roleB"]),
    );
    const syncSpy = vi
      .spyOn(asSpyTarget(worker), "syncMemberWithRoles")
      .mockResolvedValue(undefined);
    await (
      asPrivate(worker)["syncGuild"] as (
        guild: {
          id: string;
          members: { fetch: () => Promise<Map<string, ReturnType<typeof makeMember>>> };
        },
        guildId: string,
      ) => Promise<void>
    )(guild, "guild-id");
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  it("waits between member syncs when delay is configured", async () => {
    const { worker } = makeWorker({ config: { memberSyncDelayMs: 25 } });
    const member = makeMember(["roleA"]);
    const guild = {
      id: "guild1",
      members: {
        fetch: vi.fn().mockResolvedValue(new Map([["a", member]])),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(new Set(["roleA"]));
    vi.spyOn(asSpyTarget(worker), "syncMemberWithRoles").mockResolvedValue(undefined);
    const promise = (
      asPrivate(worker)["syncGuild"] as (
        guild: {
          id: string;
          members: { fetch: () => Promise<Map<string, ReturnType<typeof makeMember>>> };
        },
        guildId: string,
      ) => Promise<void>
    )(guild, "guild-id");
    await vi.runAllTimersAsync();
    await promise;
  });

  it("skips guild sync when no managed roles exist", async () => {
    const { worker } = makeWorker();
    const guild = {
      id: "guild1",
      members: {
        fetch: vi.fn(),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(new Set());
    const syncSpy = vi
      .spyOn(asSpyTarget(worker), "syncMemberWithRoles")
      .mockResolvedValue(undefined);
    await (
      asPrivate(worker)["syncGuild"] as (
        guild: {
          id: string;
          members: { fetch: () => Promise<Map<string, ReturnType<typeof makeMember>>> };
        },
        guildId: string,
      ) => Promise<void>
    )(guild, "guild-id");
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("syncs a single member", async () => {
    const { worker } = makeWorker();
    const member = makeMember(["roleA"]);
    const guild = {
      id: "guild1",
      members: {
        fetch: vi.fn().mockResolvedValue(member),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(new Set(["roleA"]));
    const syncSpy = vi
      .spyOn(asSpyTarget(worker), "syncMemberWithRoles")
      .mockResolvedValue(undefined);
    await (
      asPrivate(worker)["syncMember"] as (
        guild: {
          id: string;
          members: { fetch: (id: string) => Promise<ReturnType<typeof makeMember>> };
        },
        guildId: string,
        userId: string,
      ) => Promise<void>
    )(guild, "guild-id", "member");
    expect(syncSpy).toHaveBeenCalledOnce();
  });

  it("skips member sync when no managed roles exist", async () => {
    const { worker } = makeWorker();
    const guild = {
      id: "guild1",
      members: {
        fetch: vi.fn(),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(new Set());
    const syncSpy = vi
      .spyOn(asSpyTarget(worker), "syncMemberWithRoles")
      .mockResolvedValue(undefined);
    await (
      asPrivate(worker)["syncMember"] as (
        guild: {
          id: string;
          members: { fetch: (id: string) => Promise<ReturnType<typeof makeMember>> };
        },
        guildId: string,
        userId: string,
      ) => Promise<void>
    )(guild, "guild-id", "member");
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("computes managed role ids from tiers", async () => {
    const { worker, convex } = makeWorker();
    convex.query.mockResolvedValueOnce([
      { roleIds: ["roleA", "roleB"] },
      { roleIds: ["roleB", "roleC"] },
    ]);
    const result = await (
      asPrivate(worker)["fetchManagedRoleIds"] as (guildId: string) => Promise<Set<string>>
    )("guild-id");
    expect(result).toEqual(new Set(["roleA", "roleB", "roleC"]));
  });

  it("records failed role sync requests", async () => {
    const { worker, convex } = makeWorker();
    const guild = { id: "guild1" };
    const request = { _id: "req", scope: "user" as const };
    await (
      asPrivate(worker)["processRequest"] as (
        guild: { id: string },
        guildId: string,
        request: { _id: string; scope: "user" },
      ) => Promise<void>
    )(guild, "guild-id", request);
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestId: "req",
        status: "failed",
      }),
    );
  });

  it("uses retry-after for backoff when present", async () => {
    const { worker } = makeWorker();
    const delay = (
      asPrivate(worker)["getRetryDelayMs"] as (error: unknown, attempt: number) => number | null
    )({ rawError: { retry_after: 1 } }, 1);
    expect(delay).toBeGreaterThanOrEqual(1000);
  });

  it("uses retryAfter in milliseconds when provided", async () => {
    const { worker } = makeWorker();
    const delay = (
      asPrivate(worker)["getRetryDelayMs"] as (error: unknown, attempt: number) => number | null
    )({ retryAfter: 500 }, 1);
    expect(delay).toBeGreaterThanOrEqual(500);
  });

  it("treats retryable error codes as retryable", async () => {
    const { worker } = makeWorker();
    const delay = (
      asPrivate(worker)["getRetryDelayMs"] as (error: unknown, attempt: number) => number | null
    )({ code: "ECONNRESET" }, 1);
    expect(delay).not.toBeNull();
  });

  it("treats rate limit messages as retryable", async () => {
    const { worker } = makeWorker();
    const delay = (
      asPrivate(worker)["getRetryDelayMs"] as (error: unknown, attempt: number) => number | null
    )({ message: "Rate limit exceeded" }, 1);
    expect(delay).not.toBeNull();
  });

  it("throws after exhausting retry attempts", async () => {
    const { worker } = makeWorker();
    const op = vi.fn().mockRejectedValue({ status: 500 });
    const promise = expect(
      (
        asPrivate(worker)["runWithRetry"] as (
          op: () => Promise<string>,
          context: string,
        ) => Promise<string>
      )(op, "test"),
    ).rejects.toBeDefined();
    await vi.runAllTimersAsync();
    await promise;
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("uses fetchMe when cached bot member is missing", async () => {
    const { worker, convex } = makeWorker();
    const botMember = {
      id: "bot",
      permissions: {
        has: () => true,
      },
      roles: {},
    };
    const guild = {
      id: "guild1",
      roles: {
        cache: new Map(),
        fetch: vi.fn().mockResolvedValue(undefined),
      },
      members: {
        me: null,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(new Set());
    await (
      asPrivate(worker)["updateDiagnostics"] as (
        guild: {
          id: string;
          roles: {
            cache: Map<string, { id: string; position?: number }>;
            fetch: () => Promise<unknown>;
          };
          members: {
            me: {
              id: string;
              permissions: { has: () => boolean };
              roles: { highest?: { id: string; position: number } };
            } | null;
            fetchMe: () => Promise<{
              id: string;
              permissions: { has: () => boolean };
              roles: { highest?: { id: string; position: number } };
            }>;
          };
        },
        guildId: string,
      ) => Promise<void>
    )(guild, "guild-id");
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ botUserId: "bot" }),
    );
  });

  it("records diagnostics for missing roles and permissions", async () => {
    const { worker, convex } = makeWorker();
    const botMember = {
      id: "bot",
      permissions: {
        has: () => false,
      },
      roles: {
        highest: { id: "bot-role", position: 1 },
      },
    };
    const guild = {
      id: "guild1",
      roles: {
        cache: new Map([
          ["roleA", { id: "roleA", position: 0 }],
          ["roleB", { id: "roleB", position: 2 }],
        ]),
        fetch: vi.fn().mockResolvedValue(undefined),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
    };
    vi.spyOn(asSpyTarget(worker), "fetchManagedRoleIds").mockResolvedValue(
      new Set(["roleA", "roleB", "roleMissing"]),
    );
    await (
      asPrivate(worker)["updateDiagnostics"] as (
        guild: {
          id: string;
          roles: {
            cache: Map<string, { id: string; position: number }>;
            fetch: () => Promise<unknown>;
          };
          members: {
            me: {
              id: string;
              permissions: { has: () => boolean };
              roles: { highest: { id: string; position: number } };
            };
            fetchMe: () => Promise<{
              id: string;
              permissions: { has: () => boolean };
              roles: { highest: { id: string; position: number } };
            }>;
          };
        },
        guildId: string,
      ) => Promise<void>
    )(guild, "guild-id");
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        guildId: "guild-id",
        missingPermissions: ["MANAGE_ROLES"],
        blockedRoleIds: ["roleB"],
        missingRoleIds: ["roleMissing"],
        checkedRoleIds: ["roleA", "roleB", "roleMissing"],
      }),
    );
  });
});
