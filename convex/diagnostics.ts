import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const actorType = v.optional(v.union(v.literal("system"), v.literal("admin")));
const statusType = v.union(v.literal("pass"), v.literal("warn"), v.literal("fail"));

const normalizeStringList = (values: string[]) => {
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return Array.from(new Set(cleaned)).sort();
};

const normalizeOptionalString = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const computeOverallStatus = (diagnostics: {
  permissionsOk: boolean;
  roleHierarchyOk: boolean;
  rolesExistOk: boolean;
}): Doc<"guildDiagnostics">["overallStatus"] => {
  if (diagnostics.permissionsOk && diagnostics.roleHierarchyOk && diagnostics.rolesExistOk) {
    return "pass";
  }
  return "fail";
};

export const upsertGuildDiagnostics = mutation({
  args: {
    guildId: v.id("guilds"),
    checkedAt: v.optional(v.number()),
    botUserId: v.optional(v.string()),
    botRoleId: v.optional(v.string()),
    missingPermissions: v.array(v.string()),
    blockedRoleIds: v.array(v.string()),
    missingRoleIds: v.array(v.string()),
    checkedRoleIds: v.array(v.string()),
    overallStatus: v.optional(statusType),
    notes: v.optional(v.string()),
    actorId: v.optional(v.string()),
    actorType,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found for diagnostics.");
    }

    const checkedAt = args.checkedAt ?? now;
    const missingPermissions = normalizeStringList(args.missingPermissions);
    const blockedRoleIds = normalizeStringList(args.blockedRoleIds);
    const missingRoleIds = normalizeStringList(args.missingRoleIds);
    const checkedRoleIds = normalizeStringList(args.checkedRoleIds);
    const botUserId = normalizeOptionalString(args.botUserId);
    const botRoleId = normalizeOptionalString(args.botRoleId);
    const notes = normalizeOptionalString(args.notes);

    const permissionsOk = missingPermissions.length === 0;
    const roleHierarchyOk = blockedRoleIds.length === 0;
    const rolesExistOk = missingRoleIds.length === 0;
    const overallStatus =
      args.overallStatus ?? computeOverallStatus({ permissionsOk, roleHierarchyOk, rolesExistOk });

    const existing = await ctx.db
      .query("guildDiagnostics")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .unique();

    const payload = {
      guildId: args.guildId,
      checkedAt,
      botUserId,
      botRoleId,
      permissionsOk,
      missingPermissions,
      roleHierarchyOk,
      blockedRoleIds,
      rolesExistOk,
      missingRoleIds,
      checkedRoleIds,
      overallStatus,
      notes,
      updatedAt: now,
    };

    let diagnosticsId: Doc<"guildDiagnostics">["_id"];
    if (!existing) {
      diagnosticsId = await ctx.db.insert("guildDiagnostics", {
        ...payload,
        createdAt: now,
      });
    } else {
      diagnosticsId = existing._id;
      await ctx.db.patch(existing._id, payload);
    }

    await ctx.db.insert("auditEvents", {
      guildId: args.guildId,
      timestamp: now,
      actorType: args.actorType ?? "system",
      actorId: args.actorId,
      eventType: "diagnostics.updated",
      correlationId: diagnosticsId,
      payloadJson: JSON.stringify({
        diagnosticsId,
        overallStatus,
        permissionsOk,
        roleHierarchyOk,
        rolesExistOk,
        missingPermissionsCount: missingPermissions.length,
        blockedRoleIdsCount: blockedRoleIds.length,
        missingRoleIdsCount: missingRoleIds.length,
      }),
    });

    return diagnosticsId;
  },
});

export const getGuildDiagnostics = query({
  args: {
    guildId: v.id("guilds"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guildDiagnostics")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .unique();
  },
});
