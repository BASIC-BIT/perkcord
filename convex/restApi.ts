import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";

const API_KEY_HEADER = "x-perkcord-api-key";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const getBearerToken = (header: string | null) => {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
};

const authorizeRequest = (request: Request) => {
  const expected = process.env.PERKCORD_REST_API_KEY?.trim();
  if (!expected) {
    return jsonResponse({ error: "API key not configured." }, 500);
  }
  const provided =
    request.headers.get(API_KEY_HEADER) ?? getBearerToken(request.headers.get("authorization"));
  if (!provided || provided.trim() !== expected) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  return null;
};

const getRequiredParam = (url: URL, key: string) => {
  const value = url.searchParams.get(key);
  if (!value || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
};

const getOptionalParam = (url: URL, key: string) => {
  const value = url.searchParams.get(key);
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getRequiredParamId = <TableName extends TableNames>(url: URL, key: string) =>
  getRequiredParam(url, key) as Id<TableName>;

const getOptionalInteger = (url: URL, key: string) => {
  const value = getOptionalParam(url, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${key} must be an integer.`);
  }
  return parsed;
};

const getOptionalBooleanParam = (url: URL, key: string) => {
  const value = getOptionalParam(url, key);
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw new Error(`${key} must be a boolean.`);
};

const readJsonBody = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    throw new Error("Invalid JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const getRequiredBodyString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
};

const getOptionalBodyString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getRequiredBodyId = <TableName extends TableNames>(
  body: Record<string, unknown>,
  key: string,
) => getRequiredBodyString(body, key) as Id<TableName>;

const getOptionalBodyInteger = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be an integer.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`);
  }
  return value;
};

const getOptionalBodyBoolean = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }
  return value;
};

const hasBodyKey = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

const getOptionalBodyStringArray = (
  body: Record<string, unknown>,
  key: string,
  options?: { allowEmpty?: boolean },
) => {
  if (!hasBodyKey(body, key)) {
    return undefined;
  }
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings.`);
  }
  const cleaned = value
    .map((item) => {
      if (typeof item !== "string") {
        throw new Error(`${key} must be an array of strings.`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
  if (!options?.allowEmpty && cleaned.length === 0) {
    throw new Error(`${key} must contain at least one value.`);
  }
  return cleaned;
};

const getRequiredBodyStringArray = (body: Record<string, unknown>, key: string) => {
  const value = getOptionalBodyStringArray(body, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
};

const getOptionalBodyObject = (body: Record<string, unknown>, key: string) => {
  if (!hasBodyKey(body, key)) {
    return undefined;
  }
  const value = body[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const getOptionalRecordObject = (record: Record<string, unknown>, key: string, scope: string) => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${scope}.${key} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const getRequiredRecordString = (record: Record<string, unknown>, key: string, scope: string) => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${scope}.${key} is required.`);
  }
  return value.trim();
};

const getOptionalRecordInteger = (record: Record<string, unknown>, key: string, scope: string) => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${scope}.${key} must be an integer.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${scope}.${key} must be an integer.`);
  }
  return value;
};

const getOptionalRecordBoolean = (record: Record<string, unknown>, key: string, scope: string) => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${scope}.${key} must be a boolean.`);
  }
  return value;
};

const getOptionalRecordStringArray = (
  record: Record<string, unknown>,
  key: string,
  scope: string,
  options?: { allowEmpty?: boolean },
) => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${scope}.${key} must be an array of strings.`);
  }
  const cleaned = value
    .map((item) => {
      if (typeof item !== "string") {
        throw new Error(`${scope}.${key} must be an array of strings.`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
  if (!options?.allowEmpty && cleaned.length === 0) {
    throw new Error(`${scope}.${key} must contain at least one value.`);
  }
  return cleaned;
};

const getEntitlementPolicyFromBody = (body: Record<string, unknown>, required: boolean) => {
  const record = getOptionalBodyObject(body, "entitlementPolicy");
  if (!record) {
    if (required) {
      throw new Error("entitlementPolicy is required.");
    }
    return undefined;
  }
  const kind = getRequiredRecordString(record, "kind", "entitlementPolicy");
  if (kind !== "subscription" && kind !== "one_time") {
    throw new Error("entitlementPolicy.kind must be 'subscription' or 'one_time'.");
  }
  const durationDays = getOptionalRecordInteger(record, "durationDays", "entitlementPolicy");
  const isLifetime = getOptionalRecordBoolean(record, "isLifetime", "entitlementPolicy");
  const gracePeriodDays = getOptionalRecordInteger(record, "gracePeriodDays", "entitlementPolicy");
  const cancelAtPeriodEnd = getOptionalRecordBoolean(
    record,
    "cancelAtPeriodEnd",
    "entitlementPolicy",
  );
  return {
    kind: kind as "subscription" | "one_time",
    durationDays,
    isLifetime,
    gracePeriodDays,
    cancelAtPeriodEnd,
  };
};

const getProviderRefsFromBody = (body: Record<string, unknown>) => {
  const record = getOptionalBodyObject(body, "providerRefs");
  if (!record) {
    return undefined;
  }
  const providerRefs: Record<string, string[]> = {};
  const stripeSubscriptionPriceIds = getOptionalRecordStringArray(
    record,
    "stripeSubscriptionPriceIds",
    "providerRefs",
    { allowEmpty: true },
  );
  if (stripeSubscriptionPriceIds !== undefined) {
    providerRefs.stripeSubscriptionPriceIds = stripeSubscriptionPriceIds;
  }
  const stripeOneTimePriceIds = getOptionalRecordStringArray(
    record,
    "stripeOneTimePriceIds",
    "providerRefs",
    { allowEmpty: true },
  );
  if (stripeOneTimePriceIds !== undefined) {
    providerRefs.stripeOneTimePriceIds = stripeOneTimePriceIds;
  }
  const authorizeNetSubscriptionIds = getOptionalRecordStringArray(
    record,
    "authorizeNetSubscriptionIds",
    "providerRefs",
    { allowEmpty: true },
  );
  if (authorizeNetSubscriptionIds !== undefined) {
    providerRefs.authorizeNetSubscriptionIds = authorizeNetSubscriptionIds;
  }
  const authorizeNetOneTimeKeys = getOptionalRecordStringArray(
    record,
    "authorizeNetOneTimeKeys",
    "providerRefs",
    { allowEmpty: true },
  );
  if (authorizeNetOneTimeKeys !== undefined) {
    providerRefs.authorizeNetOneTimeKeys = authorizeNetOneTimeKeys;
  }
  const nmiPlanIds = getOptionalRecordStringArray(record, "nmiPlanIds", "providerRefs", {
    allowEmpty: true,
  });
  if (nmiPlanIds !== undefined) {
    providerRefs.nmiPlanIds = nmiPlanIds;
  }
  const nmiOneTimeKeys = getOptionalRecordStringArray(record, "nmiOneTimeKeys", "providerRefs", {
    allowEmpty: true,
  });
  if (nmiOneTimeKeys !== undefined) {
    providerRefs.nmiOneTimeKeys = nmiOneTimeKeys;
  }
  return providerRefs;
};

const getCheckoutConfigFromBody = (body: Record<string, unknown>) => {
  const record = getOptionalBodyObject(body, "checkoutConfig");
  if (!record) {
    return undefined;
  }
  const checkoutConfig: Record<string, unknown> = {};
  const authorizeNetRecord = getOptionalRecordObject(record, "authorizeNet", "checkoutConfig");
  if (authorizeNetRecord) {
    const amount = getRequiredRecordString(
      authorizeNetRecord,
      "amount",
      "checkoutConfig.authorizeNet",
    );
    const intervalLength = getOptionalRecordInteger(
      authorizeNetRecord,
      "intervalLength",
      "checkoutConfig.authorizeNet",
    );
    const intervalUnit = getOptionalBodyString(authorizeNetRecord, "intervalUnit");
    if (intervalUnit !== undefined && intervalUnit !== "days" && intervalUnit !== "months") {
      throw new Error("checkoutConfig.authorizeNet.intervalUnit must be days or months.");
    }
    checkoutConfig.authorizeNet = {
      amount,
      intervalLength,
      intervalUnit,
    };
  }
  const nmiRecord = getOptionalRecordObject(record, "nmi", "checkoutConfig");
  if (nmiRecord) {
    const hostedUrl = getRequiredRecordString(nmiRecord, "hostedUrl", "checkoutConfig.nmi");
    checkoutConfig.nmi = { hostedUrl };
  }
  return Object.keys(checkoutConfig).length > 0 ? checkoutConfig : undefined;
};

type EntitlementGrantStatus = Doc<"entitlementGrants">["status"];
type OutboundWebhookEventType = Doc<"outboundWebhookEndpoints">["eventTypes"][number];

const allowedGrantStatuses = new Set<EntitlementGrantStatus>([
  "active",
  "pending",
  "past_due",
  "canceled",
  "expired",
  "suspended_dispute",
]);

const allowedOutboundEventTypes = new Set<OutboundWebhookEventType>([
  "membership.activated",
  "membership.updated",
  "membership.canceled",
  "membership.expired",
  "grant.created",
  "grant.revoked",
  "role_sync.succeeded",
  "role_sync.failed",
]);

const allowedRoleSyncScopes = new Set(["guild", "user"]);
const getOptionalGrantStatus = (
  body: Record<string, unknown>,
  key: string,
): EntitlementGrantStatus | undefined => {
  const value = getOptionalBodyString(body, key);
  if (value === undefined) {
    return undefined;
  }
  if (!allowedGrantStatuses.has(value as EntitlementGrantStatus)) {
    throw new Error(`${key} must be a valid entitlement status.`);
  }
  return value as EntitlementGrantStatus;
};

const getRequiredRoleSyncScope = (body: Record<string, unknown>, key: string) => {
  const value = getRequiredBodyString(body, key);
  if (!allowedRoleSyncScopes.has(value)) {
    throw new Error(`${key} must be one of: guild, user.`);
  }
  return value as "guild" | "user";
};

const getOptionalOutboundEventTypes = (
  body: Record<string, unknown>,
): OutboundWebhookEventType[] | undefined => {
  const eventTypes = getOptionalBodyStringArray(body, "eventTypes");
  if (!eventTypes) {
    return undefined;
  }
  for (const eventType of eventTypes) {
    if (!allowedOutboundEventTypes.has(eventType as OutboundWebhookEventType)) {
      throw new Error("eventTypes must be valid outbound webhook event names.");
    }
  }
  return eventTypes as OutboundWebhookEventType[];
};
const handleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return jsonResponse({ error: message }, 400);
};

export const listTiers = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const tiers = await ctx.runQuery(api.entitlements.listTiers, { guildId });
    return jsonResponse({ tiers });
  } catch (error) {
    return handleError(error);
  }
});

export const createTier = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const slug = getRequiredBodyString(body, "slug");
    const name = getRequiredBodyString(body, "name");
    const description = getOptionalBodyString(body, "description");
    const displayPrice = getRequiredBodyString(body, "displayPrice");
    const perks = getRequiredBodyStringArray(body, "perks");
    const sortOrder = getOptionalBodyInteger(body, "sortOrder");
    const roleIds = getRequiredBodyStringArray(body, "roleIds");
    const actorId = getRequiredBodyString(body, "actorId");
    const entitlementPolicy = getEntitlementPolicyFromBody(body, true)!;
    const checkoutConfig = getCheckoutConfigFromBody(body);
    const providerRefs = getProviderRefsFromBody(body);

    const tierId = await ctx.runMutation(api.entitlements.createTier, {
      guildId,
      slug,
      name,
      description,
      displayPrice,
      perks,
      sortOrder,
      roleIds,
      entitlementPolicy,
      checkoutConfig,
      providerRefs,
      actorId,
    });

    return jsonResponse({ tierId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const updateTier = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const tierId = getRequiredBodyId<"tiers">(body, "tierId");
    const actorId = getRequiredBodyString(body, "actorId");
    const slug = getOptionalBodyString(body, "slug");
    const name = getOptionalBodyString(body, "name");
    const description = getOptionalBodyString(body, "description");
    const displayPrice = getOptionalBodyString(body, "displayPrice");
    const perks = getOptionalBodyStringArray(body, "perks", { allowEmpty: true });
    const sortOrder = getOptionalBodyInteger(body, "sortOrder");
    const roleIds = getOptionalBodyStringArray(body, "roleIds");
    const entitlementPolicy = getEntitlementPolicyFromBody(body, false);
    const checkoutConfig = getCheckoutConfigFromBody(body);
    const providerRefs = getProviderRefsFromBody(body);

    const updatedTierId = await ctx.runMutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      slug: slug ?? undefined,
      name: name ?? undefined,
      description: description ?? undefined,
      displayPrice: displayPrice ?? undefined,
      perks: perks ?? undefined,
      sortOrder: sortOrder ?? undefined,
      roleIds: roleIds ?? undefined,
      entitlementPolicy: entitlementPolicy ?? undefined,
      checkoutConfig: checkoutConfig ?? undefined,
      providerRefs: providerRefs ?? undefined,
      actorId,
    });

    return jsonResponse({ tierId: updatedTierId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const listMembers = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const search = getOptionalParam(url, "search");
    const limit = getOptionalInteger(url, "limit");
    const members = await ctx.runQuery(api.members.searchMembers, {
      guildId,
      search,
      limit,
    });
    return jsonResponse({ members });
  } catch (error) {
    return handleError(error);
  }
});

export const listGuilds = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const limit = getOptionalInteger(url, "limit");
    const guilds = await ctx.runQuery(api.guilds.listGuilds, { limit });
    return jsonResponse({ guilds });
  } catch (error) {
    return handleError(error);
  }
});

export const getMemberSnapshot = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const discordUserId = getRequiredParam(url, "discordUserId");
    const auditLimit = getOptionalInteger(url, "auditLimit");
    const snapshot = await ctx.runQuery(api.entitlements.getMemberSnapshot, {
      guildId,
      discordUserId,
      auditLimit,
    });
    return jsonResponse(snapshot);
  } catch (error) {
    return handleError(error);
  }
});

export const listAuditEvents = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const subjectDiscordUserId = getOptionalParam(url, "subjectDiscordUserId");
    const limit = getOptionalInteger(url, "limit");
    const before = getOptionalInteger(url, "before");
    const events = await ctx.runQuery(api.auditEvents.listAuditEvents, {
      guildId,
      limit,
      before,
      subjectDiscordUserId,
    });
    return jsonResponse({ events });
  } catch (error) {
    return handleError(error);
  }
});

export const listRoleSyncRequests = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const discordUserId = getOptionalParam(url, "discordUserId");
    const limit = getOptionalInteger(url, "limit");
    const requests = await ctx.runQuery(api.roleSync.listRoleSyncRequests, {
      guildId,
      discordUserId,
      limit,
    });
    return jsonResponse({ requests });
  } catch (error) {
    return handleError(error);
  }
});

export const getActiveMemberCounts = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const tiers = await ctx.runQuery(api.entitlements.getActiveMemberCountsByTier, {
      guildId,
    });
    return jsonResponse({ tiers });
  } catch (error) {
    return handleError(error);
  }
});

export const getRevenueIndicators = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const scanLimit = getOptionalInteger(url, "scanLimit");
    const windowDays = getOptionalInteger(url, "windowDays");
    const indicators = await ctx.runQuery(api.providerEvents.getRevenueIndicatorsForGuild, {
      guildId,
      scanLimit,
      windowDays,
    });
    return jsonResponse(indicators);
  } catch (error) {
    return handleError(error);
  }
});

export const getProviderEventDiagnostics = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const scanLimit = getOptionalInteger(url, "scanLimit");
    const summary = await ctx.runQuery(api.providerEvents.getLatestProviderEventsForGuild, {
      guildId,
      scanLimit,
    });
    return jsonResponse(summary);
  } catch (error) {
    return handleError(error);
  }
});

export const getGuildDiagnostics = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const diagnostics = await ctx.runQuery(api.diagnostics.getGuildDiagnostics, {
      guildId,
    });
    return jsonResponse({ diagnostics });
  } catch (error) {
    return handleError(error);
  }
});

export const listFailedOutboundWebhooks = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const limit = getOptionalInteger(url, "limit");
    const deliveries = await ctx.runQuery(
      api.outboundWebhooks.listFailedOutboundWebhookDeliveries,
      {
        guildId,
        limit,
      },
    );
    return jsonResponse({ deliveries });
  } catch (error) {
    return handleError(error);
  }
});

export const listOutboundWebhookEndpoints = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(request.url);
    const guildId = getRequiredParamId<"guilds">(url, "guildId");
    const activeOnly = getOptionalBooleanParam(url, "activeOnly");
    const endpoints = await ctx.runQuery(api.outboundWebhooks.listOutboundWebhookEndpoints, {
      guildId,
      activeOnly,
    });
    return jsonResponse({ endpoints });
  } catch (error) {
    return handleError(error);
  }
});

export const createOutboundWebhookEndpoint = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const url = getRequiredBodyString(body, "url");
    const actorId = getRequiredBodyString(body, "actorId");
    const eventTypes = getOptionalOutboundEventTypes(body);
    const isActive = getOptionalBodyBoolean(body, "isActive");

    const result = await ctx.runMutation(api.outboundWebhooks.createOutboundWebhookEndpoint, {
      guildId,
      url,
      eventTypes,
      isActive,
      actorId,
      actorType: "admin",
    });

    return jsonResponse(result, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const updateOutboundWebhookEndpoint = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const endpointId = getRequiredBodyId<"outboundWebhookEndpoints">(body, "endpointId");
    const actorId = getRequiredBodyString(body, "actorId");
    const url = getOptionalBodyString(body, "url");
    const eventTypes = getOptionalOutboundEventTypes(body);
    const isActive = getOptionalBodyBoolean(body, "isActive");

    if (url === undefined && eventTypes === undefined && isActive === undefined) {
      throw new Error("At least one update field is required.");
    }

    const updatedId = await ctx.runMutation(api.outboundWebhooks.updateOutboundWebhookEndpoint, {
      guildId,
      endpointId,
      url,
      eventTypes,
      isActive,
      actorId,
      actorType: "admin",
    });

    return jsonResponse({ endpointId: updatedId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const createManualGrant = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const tierId = getRequiredBodyId<"tiers">(body, "tierId");
    const discordUserId = getRequiredBodyString(body, "discordUserId");
    const actorId = getRequiredBodyString(body, "actorId");
    const status = getOptionalGrantStatus(body, "status");
    const validFrom = getOptionalBodyInteger(body, "validFrom");
    const validThrough = getOptionalBodyInteger(body, "validThrough");
    const note = getOptionalBodyString(body, "note");

    const grantId = await ctx.runMutation(api.entitlements.createManualGrant, {
      guildId,
      tierId,
      discordUserId,
      actorId,
      status,
      validFrom,
      validThrough,
      note,
    });

    return jsonResponse({ grantId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const revokeManualGrant = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const grantId = getRequiredBodyId<"entitlementGrants">(body, "grantId");
    const actorId = getRequiredBodyString(body, "actorId");
    const note = getOptionalBodyString(body, "note");

    await ctx.runMutation(api.entitlements.revokeEntitlementGrant, {
      guildId,
      grantId,
      actorId,
      note,
    });

    return jsonResponse({ grantId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const requestRoleSync = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const scope = getRequiredRoleSyncScope(body, "scope");
    const actorId = getRequiredBodyString(body, "actorId");
    const reason = getOptionalBodyString(body, "reason");
    const discordUserId = getOptionalBodyString(body, "discordUserId");

    if (scope === "user" && !discordUserId) {
      throw new Error("discordUserId is required for user scope.");
    }
    if (scope === "guild" && discordUserId) {
      throw new Error("discordUserId is only allowed for user scope.");
    }

    const requestId = await ctx.runMutation(api.roleSync.requestRoleSync, {
      guildId,
      scope,
      discordUserId,
      actorId,
      actorType: "admin",
      reason,
    });

    return jsonResponse({ requestId }, 200);
  } catch (error) {
    return handleError(error);
  }
});

export const registerRoleConnectionMetadata = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authError = authorizeRequest(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const guildId = getRequiredBodyId<"guilds">(body, "guildId");
    const actorId = getRequiredBodyString(body, "actorId");

    const result = await ctx.runAction(
      api.discordRoleConnectionsActions.registerRoleConnectionMetadata,
      {
        guildId,
        actorId,
      },
    );

    return jsonResponse(result, 200);
  } catch (error) {
    return handleError(error);
  }
});
