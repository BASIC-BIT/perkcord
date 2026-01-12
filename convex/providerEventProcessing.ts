import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  createOutboundWebhookPayload,
  enqueueOutboundWebhookDeliveries,
} from "./outboundWebhookQueue";

const DAY_MS = 24 * 60 * 60 * 1000;
const providers: Doc<"providerEvents">["provider"][] = [
  "stripe",
  "authorize_net",
  "nmi",
];

type PurchaseKind = "subscription" | "one_time";
type MembershipEventType =
  | "membership.activated"
  | "membership.updated"
  | "membership.canceled"
  | "membership.expired";

const activationEventTypes = new Set<
  Doc<"providerEvents">["normalizedEventType"]
>(["PAYMENT_SUCCEEDED", "SUBSCRIPTION_ACTIVE"]);

const normalizePriceIds = (priceIds?: string[]) => {
  if (!priceIds) {
    return [] as string[];
  }
  const trimmed = priceIds.map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(trimmed));
};

const coerceLimit = (limit?: number) => {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(limit, 200);
};

const coerceEventTimestamp = (event: Doc<"providerEvents">) => {
  return event.occurredAt ?? event.receivedAt ?? Date.now();
};

const mapEventToStatus = (
  eventType: Doc<"providerEvents">["normalizedEventType"]
): Doc<"entitlementGrants">["status"] => {
  switch (eventType) {
    case "PAYMENT_SUCCEEDED":
    case "SUBSCRIPTION_ACTIVE":
      return "active";
    case "PAYMENT_FAILED":
    case "SUBSCRIPTION_PAST_DUE":
      return "past_due";
    case "SUBSCRIPTION_CANCELED":
    case "REFUND_ISSUED":
      return "canceled";
    case "CHARGEBACK_OPENED":
      return "suspended_dispute";
    case "CHARGEBACK_CLOSED":
      return "active";
  }
};

const getSourceForProvider = (
  provider: Doc<"providerEvents">["provider"],
  purchaseKind: PurchaseKind
): Doc<"entitlementGrants">["source"] => {
  if (purchaseKind === "subscription") {
    return `${provider}_subscription` as Doc<"entitlementGrants">["source"];
  }
  return `${provider}_one_time` as Doc<"entitlementGrants">["source"];
};

const derivePurchaseKindFromSource = (
  source: Doc<"entitlementGrants">["source"]
): PurchaseKind | null => {
  if (source.endsWith("_subscription")) {
    return "subscription";
  }
  if (source.endsWith("_one_time")) {
    return "one_time";
  }
  return null;
};

const getMatchKind = (
  tier: Doc<"tiers">,
  provider: Doc<"providerEvents">["provider"],
  priceIds: Set<string>
): PurchaseKind | "ambiguous" | null => {
  if (!tier.providerRefs || priceIds.size === 0) {
    return null;
  }

  const hasAny = (ids?: string[]) =>
    Boolean(ids?.some((id) => priceIds.has(id.trim())));

  switch (provider) {
    case "stripe": {
      const subscription = hasAny(tier.providerRefs.stripeSubscriptionPriceIds);
      const oneTime = hasAny(tier.providerRefs.stripeOneTimePriceIds);
      if (subscription && oneTime) {
        return "ambiguous";
      }
      if (subscription) {
        return "subscription";
      }
      if (oneTime) {
        return "one_time";
      }
      return null;
    }
    case "authorize_net": {
      const subscription = hasAny(
        tier.providerRefs.authorizeNetSubscriptionIds
      );
      const oneTime = hasAny(tier.providerRefs.authorizeNetOneTimeKeys);
      if (subscription && oneTime) {
        return "ambiguous";
      }
      if (subscription) {
        return "subscription";
      }
      if (oneTime) {
        return "one_time";
      }
      return null;
    }
    case "nmi": {
      const subscription = hasAny(tier.providerRefs.nmiPlanIds);
      const oneTime = hasAny(tier.providerRefs.nmiOneTimeKeys);
      if (subscription && oneTime) {
        return "ambiguous";
      }
      if (subscription) {
        return "subscription";
      }
      if (oneTime) {
        return "one_time";
      }
      return null;
    }
  }
};

const computeValidThroughForNewGrant = (
  tier: Doc<"tiers">,
  purchaseKind: PurchaseKind,
  validFrom: number
) => {
  if (purchaseKind !== "one_time") {
    return undefined;
  }
  if (tier.entitlementPolicy.isLifetime) {
    return undefined;
  }
  if (tier.entitlementPolicy.durationDays === undefined) {
    return undefined;
  }
  return validFrom + tier.entitlementPolicy.durationDays * DAY_MS;
};

const computeNextValidThrough = (
  grant: Doc<"entitlementGrants">,
  tier: Doc<"tiers">,
  purchaseKind: PurchaseKind,
  nextStatus: Doc<"entitlementGrants">["status"],
  now: number
) => {
  let next = grant.validThrough;
  if (nextStatus === "canceled" || nextStatus === "expired") {
    if (
      purchaseKind === "subscription" &&
      tier.entitlementPolicy.cancelAtPeriodEnd &&
      grant.validThrough !== undefined &&
      grant.validThrough > now
    ) {
      return grant.validThrough;
    }
    return now;
  }

  if (nextStatus === "past_due" && purchaseKind === "subscription") {
    const graceDays = tier.entitlementPolicy.gracePeriodDays;
    if (graceDays !== undefined) {
      const candidate = now + graceDays * DAY_MS;
      if (next === undefined || candidate > next) {
        next = candidate;
      }
    }
  }

  return next;
};

const getMembershipEventType = (
  previousStatus: Doc<"entitlementGrants">["status"] | null,
  nextStatus: Doc<"entitlementGrants">["status"]
): MembershipEventType => {
  if (nextStatus === "canceled") {
    return "membership.canceled";
  }
  if (nextStatus === "expired") {
    return "membership.expired";
  }
  if (nextStatus === "active" && previousStatus !== "active") {
    return "membership.activated";
  }
  return "membership.updated";
};

const mergeSecondaryIds = (existing: string[] | undefined, next: string[]) => {
  const merged = new Set<string>();
  for (const value of existing ?? []) {
    const trimmed = value.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  for (const value of next) {
    const trimmed = value.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  const result = Array.from(merged);
  return result.length > 0 ? result : undefined;
};

const arraysEqual = (left?: string[], right?: string[]) => {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const truncateError = (value: string, limit = 500) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
};

const buildSecondaryIds = (
  sourceRefId: string,
  event: Doc<"providerEvents">
) => {
  const secondary: string[] = [];
  if (event.providerObjectId && event.providerObjectId !== sourceRefId) {
    secondary.push(event.providerObjectId);
  }
  if (event.providerEventId && event.providerEventId !== sourceRefId) {
    secondary.push(event.providerEventId);
  }
  return secondary;
};

export const processProviderEvents = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = coerceLimit(args.limit);
    const candidates: Doc<"providerEvents">[] = [];

    for (const provider of providers) {
      const recent = await ctx.db
        .query("providerEvents")
        .withIndex("by_provider_time", (q) => q.eq("provider", provider))
        .order("asc")
        .take(limit);
      candidates.push(...recent);
    }

    const pending = candidates
      .filter((event) => !event.processedStatus)
      .sort((a, b) => a.receivedAt - b.receivedAt)
      .slice(0, limit);

    const results: Array<{
      providerEventId: string;
      status: "processed" | "failed" | "skipped";
      grantId?: string;
      reason?: string;
    }> = [];

    for (const event of pending) {
      const now = Date.now();
      try {
        const sourceRefId = (event.providerObjectId ?? event.providerEventId)
          .trim()
          .replace(/\s+/g, " ");
        const normalizedEventType = event.normalizedEventType;
        const nextStatus = mapEventToStatus(normalizedEventType);

        let existingGrant: Doc<"entitlementGrants"> | null = null;
        if (sourceRefId) {
          existingGrant = await ctx.db
            .query("entitlementGrants")
            .withIndex("by_source_ref", (q) =>
              q
                .eq("sourceRefProvider", event.provider)
                .eq("sourceRefId", sourceRefId)
            )
            .unique();
        }

        let guildId: Doc<"guilds">["_id"];
        let discordUserId: string;

        if (existingGrant) {
          guildId = existingGrant.guildId;
          discordUserId = existingGrant.discordUserId;
        } else {
          const providerCustomerId = event.providerCustomerId?.trim();
          if (!providerCustomerId) {
            throw new Error("providerCustomerId is required to map the event.");
          }

          const links = await ctx.db
            .query("providerCustomerLinks")
            .withIndex("by_provider_customer", (q) =>
              q
                .eq("provider", event.provider)
                .eq("providerCustomerId", providerCustomerId)
            )
            .take(2);

          if (links.length === 0) {
            throw new Error("No provider customer link found for event.");
          }
          if (links.length > 1) {
            throw new Error("Multiple provider customer links found for event.");
          }

          guildId = links[0].guildId;
          discordUserId = links[0].discordUserId;
        }

        let tier: Doc<"tiers"> | null = null;
        let purchaseKind: PurchaseKind | null = null;

        if (existingGrant) {
          purchaseKind = derivePurchaseKindFromSource(existingGrant.source);
          if (!purchaseKind) {
            throw new Error("Existing grant is not provider-backed.");
          }
          tier = await ctx.db.get(existingGrant.tierId);
          if (!tier || tier.guildId !== guildId) {
            throw new Error("Tier not found for existing grant.");
          }
        } else {
          const priceIds = normalizePriceIds(event.providerPriceIds);
          if (priceIds.length === 0) {
            throw new Error("providerPriceIds are required to map the event.");
          }
          const tiers = await ctx.db
            .query("tiers")
            .withIndex("by_guild", (q) => q.eq("guildId", guildId))
            .collect();

          const matches: Array<{ tier: Doc<"tiers">; kind: PurchaseKind }> = [];
          const priceSet = new Set(priceIds);
          for (const candidate of tiers) {
            const matchKind = getMatchKind(candidate, event.provider, priceSet);
            if (matchKind === "ambiguous") {
              throw new Error(
                `Tier ${candidate._id} matches both subscription and one-time price ids.`
              );
            }
            if (matchKind) {
              matches.push({ tier: candidate, kind: matchKind });
            }
          }

          if (matches.length === 0) {
            throw new Error("No tier matched provider price ids.");
          }
          if (matches.length > 1) {
            throw new Error("Multiple tiers matched provider price ids.");
          }

          tier = matches[0].tier;
          purchaseKind = matches[0].kind;
        }

        if (!tier || !purchaseKind) {
          throw new Error("Unable to resolve tier or purchase type.");
        }

        if (!existingGrant) {
          if (!activationEventTypes.has(normalizedEventType)) {
            throw new Error("Event does not create a new entitlement grant.");
          }

          const validFrom = coerceEventTimestamp(event);
          const validThrough = computeValidThroughForNewGrant(
            tier,
            purchaseKind,
            validFrom
          );

          const sourceRefProvider = event.provider;
          const resolvedSourceRefId = sourceRefId || event.providerEventId;
          const secondaryIds = buildSecondaryIds(resolvedSourceRefId, event);

          const grantId = await ctx.db.insert("entitlementGrants", {
            guildId,
            tierId: tier._id,
            discordUserId,
            status: nextStatus,
            validFrom,
            validThrough,
            source: getSourceForProvider(event.provider, purchaseKind),
            sourceRefProvider,
            sourceRefId: resolvedSourceRefId,
            sourceRefSecondaryIds:
              secondaryIds.length > 0 ? secondaryIds : undefined,
            createdAt: now,
            updatedAt: now,
          });

          await ctx.db.insert("auditEvents", {
            guildId,
            timestamp: now,
            actorType: "system",
            actorId: `provider:${event.provider}`,
            subjectDiscordUserId: discordUserId,
            subjectTierId: tier._id,
            subjectGrantId: grantId,
            eventType: "grant.created",
            correlationId: grantId,
            payloadJson: JSON.stringify({
              grantId,
              provider: event.provider,
              providerEventId: event.providerEventId,
              normalizedEventType,
              status: nextStatus,
              validFrom,
              validThrough: validThrough ?? null,
              source: getSourceForProvider(event.provider, purchaseKind),
            }),
          });

          await enqueueOutboundWebhookDeliveries(ctx, {
            guildId,
            eventType: "grant.created",
            eventId: grantId,
            payloadJson: createOutboundWebhookPayload({
              id: grantId,
              type: "grant.created",
              guildId,
              occurredAt: now,
              data: {
                grantId,
                tierId: tier._id,
                discordUserId,
                status: nextStatus,
                validFrom,
                validThrough: validThrough ?? null,
                source: getSourceForProvider(event.provider, purchaseKind),
              },
            }),
          });

          const membershipEventType = getMembershipEventType(null, nextStatus);
          await enqueueOutboundWebhookDeliveries(ctx, {
            guildId,
            eventType: membershipEventType,
            eventId: grantId,
            payloadJson: createOutboundWebhookPayload({
              id: grantId,
              type: membershipEventType,
              guildId,
              occurredAt: now,
              data: {
                grantId,
                tierId: tier._id,
                discordUserId,
                status: nextStatus,
                validFrom,
                validThrough: validThrough ?? null,
                source: getSourceForProvider(event.provider, purchaseKind),
              },
            }),
          });

          await ctx.db.patch(event._id, {
            processedStatus: "processed",
            processedAt: now,
            updatedAt: now,
            lastError: undefined,
          });

          results.push({
            providerEventId: event.providerEventId,
            status: "processed",
            grantId,
          });
          continue;
        }

        if (
          existingGrant.sourceRefProvider &&
          existingGrant.sourceRefProvider !== event.provider
        ) {
          throw new Error("Provider mismatch for existing grant.");
        }

        const nextValidThrough = computeNextValidThrough(
          existingGrant,
          tier,
          purchaseKind,
          nextStatus,
          now
        );

        const patch: Partial<Doc<"entitlementGrants">> = {};
        const updatedFields: string[] = [];

        if (existingGrant.status !== nextStatus) {
          patch.status = nextStatus;
          updatedFields.push("status");
        }
        if (existingGrant.validThrough !== nextValidThrough) {
          patch.validThrough = nextValidThrough;
          updatedFields.push("validThrough");
        }
        if (!existingGrant.sourceRefProvider) {
          patch.sourceRefProvider = event.provider;
          updatedFields.push("sourceRefProvider");
        }
        if (!existingGrant.sourceRefId && sourceRefId) {
          patch.sourceRefId = sourceRefId;
          updatedFields.push("sourceRefId");
        }

        const secondaryIds = buildSecondaryIds(
          existingGrant.sourceRefId ?? sourceRefId,
          event
        );
        const mergedSecondaryIds = mergeSecondaryIds(
          existingGrant.sourceRefSecondaryIds,
          secondaryIds
        );
        if (!arraysEqual(mergedSecondaryIds, existingGrant.sourceRefSecondaryIds)) {
          patch.sourceRefSecondaryIds = mergedSecondaryIds;
          updatedFields.push("sourceRefSecondaryIds");
        }

        if (updatedFields.length > 0) {
          patch.updatedAt = now;
          await ctx.db.patch(existingGrant._id, patch);

          await ctx.db.insert("auditEvents", {
            guildId,
            timestamp: now,
            actorType: "system",
            actorId: `provider:${event.provider}`,
            subjectDiscordUserId: existingGrant.discordUserId,
            subjectTierId: existingGrant.tierId,
            subjectGrantId: existingGrant._id,
            eventType: "grant.updated",
            correlationId: existingGrant._id,
            payloadJson: JSON.stringify({
              grantId: existingGrant._id,
              provider: event.provider,
              providerEventId: event.providerEventId,
              normalizedEventType,
              updatedFields,
              previousStatus: existingGrant.status,
              status: nextStatus,
              previousValidThrough: existingGrant.validThrough ?? null,
              validThrough: nextValidThrough ?? null,
            }),
          });

          const shouldEmitMembership =
            updatedFields.includes("status") ||
            updatedFields.includes("validThrough");
          if (shouldEmitMembership) {
            const membershipEventType = getMembershipEventType(
              existingGrant.status,
              nextStatus
            );
            await enqueueOutboundWebhookDeliveries(ctx, {
              guildId,
              eventType: membershipEventType,
              eventId: existingGrant._id,
              payloadJson: createOutboundWebhookPayload({
                id: existingGrant._id,
                type: membershipEventType,
                guildId,
                occurredAt: now,
                data: {
                  grantId: existingGrant._id,
                  tierId: existingGrant.tierId,
                  discordUserId: existingGrant.discordUserId,
                  status: nextStatus,
                  previousStatus: existingGrant.status,
                  validFrom: existingGrant.validFrom,
                  validThrough: nextValidThrough ?? null,
                  source: existingGrant.source,
                },
              }),
            });
          }
        }

        await ctx.db.patch(event._id, {
          processedStatus: "processed",
          processedAt: now,
          updatedAt: now,
          lastError: undefined,
        });

        results.push({
          providerEventId: event.providerEventId,
          status: "processed",
          grantId: existingGrant._id,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error.";
        await ctx.db.patch(event._id, {
          processedStatus: "failed",
          processedAt: now,
          updatedAt: now,
          lastError: truncateError(message),
        });
        results.push({
          providerEventId: event.providerEventId,
          status: "failed",
          reason: message,
        });
      }
    }

    return {
      evaluatedAt: Date.now(),
      processedCount: results.filter((item) => item.status === "processed")
        .length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    };
  },
});
