"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { createHmac } from "crypto";
import { internal } from "./_generated/api";

const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_BASE_DELAY_MS = 30 * 1000;
const DELIVERY_MAX_DELAY_MS = 15 * 60 * 1000;

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const computeBackoffMs = (attempt: number) => {
  const multiplier = Math.max(0, attempt - 1);
  const delay = DELIVERY_BASE_DELAY_MS * Math.pow(2, multiplier);
  return Math.min(delay, DELIVERY_MAX_DELAY_MS);
};

const truncateError = (value: string, limit = 500) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
};

export const processOutboundWebhookDeliveries = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asOf = Date.now();
    const limit = coerceLimit(args.limit);
    const deliveryIds = await ctx.runQuery(
      internal.outboundWebhooks.listDueOutboundWebhookDeliveryIds,
      { asOf, limit },
    );

    const results: Array<{ deliveryId: string; status: string }> = [];

    for (const deliveryId of deliveryIds) {
      const delivery = await ctx.runMutation(
        internal.outboundWebhooks.startOutboundWebhookDelivery,
        {
          deliveryId,
          asOf,
        },
      );

      if (!delivery) {
        continue;
      }

      const timestamp = Date.now();
      const signedPayload = `${timestamp}.${delivery.payloadJson}`;
      const signature = createHmac("sha256", delivery.endpointSigningSecret)
        .update(signedPayload, "utf8")
        .digest("hex");

      try {
        const response = await fetch(delivery.endpointUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-perkcord-event-type": delivery.eventType,
            "x-perkcord-signature": `t=${timestamp},v1=${signature}`,
          },
          body: delivery.payloadJson,
        });

        if (response.ok) {
          await ctx.runMutation(internal.outboundWebhooks.markOutboundWebhookDeliverySucceeded, {
            deliveryId,
            deliveredAt: Date.now(),
          });
          results.push({ deliveryId, status: "succeeded" });
          continue;
        }

        const message = `HTTP ${response.status}`;
        const attempts = delivery.attempts;
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          await ctx.runMutation(internal.outboundWebhooks.markOutboundWebhookDeliveryFailed, {
            deliveryId,
            status: "failed",
            lastError: truncateError(message),
          });
          results.push({ deliveryId, status: "failed" });
          continue;
        }

        const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
        await ctx.runMutation(internal.outboundWebhooks.markOutboundWebhookDeliveryFailed, {
          deliveryId,
          status: "pending",
          nextAttemptAt,
          lastError: truncateError(message),
        });
        results.push({ deliveryId, status: "pending" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        const attempts = delivery.attempts;
        if (attempts >= MAX_DELIVERY_ATTEMPTS) {
          await ctx.runMutation(internal.outboundWebhooks.markOutboundWebhookDeliveryFailed, {
            deliveryId,
            status: "failed",
            lastError: truncateError(message),
          });
          results.push({ deliveryId, status: "failed" });
          continue;
        }

        const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
        await ctx.runMutation(internal.outboundWebhooks.markOutboundWebhookDeliveryFailed, {
          deliveryId,
          status: "pending",
          nextAttemptAt,
          lastError: truncateError(message),
        });
        results.push({ deliveryId, status: "pending" });
      }
    }

    return {
      evaluatedAt: asOf,
      processedCount: results.length,
      results,
    };
  },
});
