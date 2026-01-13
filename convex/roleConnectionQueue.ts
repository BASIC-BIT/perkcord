import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const pendingStatuses: Doc<"roleConnectionUpdates">["status"][] = ["pending", "in_progress"];

type EnqueueArgs = {
  guildId: Doc<"guilds">["_id"];
  discordUserId: string;
};

export const enqueueRoleConnectionUpdate = async (
  ctx: Pick<MutationCtx, "db">,
  args: EnqueueArgs,
) => {
  const now = Date.now();
  const discordUserId = args.discordUserId.trim();
  if (!discordUserId) {
    throw new Error("discordUserId is required to enqueue role connection sync");
  }

  for (const status of pendingStatuses) {
    const existing = await ctx.db
      .query("roleConnectionUpdates")
      .withIndex("by_guild_user_status", (q) =>
        q.eq("guildId", args.guildId).eq("discordUserId", discordUserId).eq("status", status),
      )
      .take(1);
    if (existing.length > 0) {
      return { updateId: existing[0]._id, enqueued: false };
    }
  }

  const updateId = await ctx.db.insert("roleConnectionUpdates", {
    guildId: args.guildId,
    discordUserId,
    status: "pending",
    requestedAt: now,
    updatedAt: now,
  });

  return { updateId, enqueued: true };
};
