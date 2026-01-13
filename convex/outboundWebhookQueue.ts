import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export type OutboundWebhookEventType = Doc<"outboundWebhookEndpoints">["eventTypes"][number];

type OutboundWebhookPayload = {
  id: string;
  type: OutboundWebhookEventType;
  guildId: string;
  occurredAt: number;
  data: Record<string, unknown>;
};

type EnqueueArgs = {
  guildId: Doc<"guilds">["_id"];
  eventType: OutboundWebhookEventType;
  eventId: string;
  payloadJson: string;
};

export const createOutboundWebhookPayload = (payload: OutboundWebhookPayload) => {
  return JSON.stringify(payload);
};

export const enqueueOutboundWebhookDeliveries = async (
  ctx: Pick<MutationCtx, "db">,
  args: EnqueueArgs,
) => {
  const now = Date.now();
  const eventId = args.eventId.trim();
  if (!eventId) {
    throw new Error("eventId is required to enqueue outbound webhook delivery.");
  }

  const endpoints = await ctx.db
    .query("outboundWebhookEndpoints")
    .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
    .collect();

  const activeEndpoints = endpoints.filter(
    (endpoint: Doc<"outboundWebhookEndpoints">) =>
      endpoint.isActive && endpoint.eventTypes.includes(args.eventType),
  );

  const deliveryIds: Array<Doc<"outboundWebhookDeliveries">["_id"]> = [];

  for (const endpoint of activeEndpoints) {
    const existing = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_endpoint_event", (q) =>
        q.eq("endpointId", endpoint._id).eq("eventType", args.eventType).eq("eventId", eventId),
      )
      .unique();

    if (existing) {
      continue;
    }

    const deliveryId = await ctx.db.insert("outboundWebhookDeliveries", {
      guildId: args.guildId,
      endpointId: endpoint._id,
      endpointUrl: endpoint.url,
      endpointSigningSecret: endpoint.signingSecret,
      eventType: args.eventType,
      eventId,
      payloadJson: args.payloadJson,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });

    deliveryIds.push(deliveryId);
  }

  return {
    enqueuedCount: deliveryIds.length,
    deliveryIds,
  };
};
