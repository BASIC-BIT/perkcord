import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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
    request.headers.get(API_KEY_HEADER) ??
    getBearerToken(request.headers.get("authorization"));
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

const hasBodyKey = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

const getOptionalBodyStringArray = (
  body: Record<string, unknown>,
  key: string,
  options?: { allowEmpty?: boolean }
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

const getRequiredBodyStringArray = (
  body: Record<string, unknown>,
  key: string
) => {
  const value = getOptionalBodyStringArray(body, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
};

const getOptionalBodyObject = (
  body: Record<string, unknown>,
  key: string
) => {
  if (!hasBodyKey(body, key)) {
    return undefined;
  }
  const value = body[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const getRequiredRecordString = (
  record: Record<string, unknown>,
  key: string,
  scope: string
) => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${scope}.${key} is required.`);
  }
  return value.trim();
};

const getOptionalRecordInteger = (
  record: Record<string, unknown>,
  key: string,
  scope: string
) => {
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

const getOptionalRecordBoolean = (
  record: Record<string, unknown>,
  key: string,
  scope: string
) => {
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
  options?: { allowEmpty?: boolean }
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

const getEntitlementPolicyFromBody = (
  body: Record<string, unknown>,
  required: boolean
) => {
  const record = getOptionalBodyObject(body, "entitlementPolicy");
  if (!record) {
    if (required) {
      throw new Error("entitlementPolicy is required.");
    }
    return undefined;
  }
  const kind = getRequiredRecordString(record, "kind", "entitlementPolicy");
  if (kind !== "subscription" && kind !== "one_time") {
    throw new Error(
      "entitlementPolicy.kind must be 'subscription' or 'one_time'."
    );
  }
  const durationDays = getOptionalRecordInteger(
    record,
    "durationDays",
    "entitlementPolicy"
  );
  const isLifetime = getOptionalRecordBoolean(
    record,
    "isLifetime",
    "entitlementPolicy"
  );
  const gracePeriodDays = getOptionalRecordInteger(
    record,
    "gracePeriodDays",
    "entitlementPolicy"
  );
  const cancelAtPeriodEnd = getOptionalRecordBoolean(
    record,
    "cancelAtPeriodEnd",
    "entitlementPolicy"
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
    { allowEmpty: true }
  );
  if (stripeSubscriptionPriceIds !== undefined) {
    providerRefs.stripeSubscriptionPriceIds = stripeSubscriptionPriceIds;
  }
  const stripeOneTimePriceIds = getOptionalRecordStringArray(
    record,
    "stripeOneTimePriceIds",
    "providerRefs",
    { allowEmpty: true }
  );
  if (stripeOneTimePriceIds !== undefined) {
    providerRefs.stripeOneTimePriceIds = stripeOneTimePriceIds;
  }
  const authorizeNetSubscriptionIds = getOptionalRecordStringArray(
    record,
    "authorizeNetSubscriptionIds",
    "providerRefs",
    { allowEmpty: true }
  );
  if (authorizeNetSubscriptionIds !== undefined) {
    providerRefs.authorizeNetSubscriptionIds = authorizeNetSubscriptionIds;
  }
  const authorizeNetOneTimeKeys = getOptionalRecordStringArray(
    record,
    "authorizeNetOneTimeKeys",
    "providerRefs",
    { allowEmpty: true }
  );
  if (authorizeNetOneTimeKeys !== undefined) {
    providerRefs.authorizeNetOneTimeKeys = authorizeNetOneTimeKeys;
  }
  const nmiPlanIds = getOptionalRecordStringArray(
    record,
    "nmiPlanIds",
    "providerRefs",
    { allowEmpty: true }
  );
  if (nmiPlanIds !== undefined) {
    providerRefs.nmiPlanIds = nmiPlanIds;
  }
  const nmiOneTimeKeys = getOptionalRecordStringArray(
    record,
    "nmiOneTimeKeys",
    "providerRefs",
    { allowEmpty: true }
  );
  if (nmiOneTimeKeys !== undefined) {
    providerRefs.nmiOneTimeKeys = nmiOneTimeKeys;
  }
  return providerRefs;
};

const allowedGrantStatuses = new Set([
  "active",
  "pending",
  "past_due",
  "canceled",
  "expired",
  "suspended_dispute",
]);

const allowedRoleSyncScopes = new Set(["guild", "user"]);
const getOptionalGrantStatus = (
  body: Record<string, unknown>,
  key: string
) => {
  const value = getOptionalBodyString(body, key);
  if (value === undefined) {
    return undefined;
  }
  if (!allowedGrantStatuses.has(value)) {
    throw new Error(`${key} must be a valid entitlement status.`);
  }
  return value;
};

const getRequiredRoleSyncScope = (
  body: Record<string, unknown>,
  key: string
) => {
  const value = getRequiredBodyString(body, key);
  if (!allowedRoleSyncScopes.has(value)) {
    throw new Error(`${key} must be one of: guild, user.`);
  }
  return value as "guild" | "user";
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
    const guildId = getRequiredParam(url, "guildId");
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
    const guildId = getRequiredBodyString(body, "guildId");
    const name = getRequiredBodyString(body, "name");
    const description = getOptionalBodyString(body, "description");
    const roleIds = getRequiredBodyStringArray(body, "roleIds");
    const actorId = getRequiredBodyString(body, "actorId");
    const entitlementPolicy = getEntitlementPolicyFromBody(body, true);
    const providerRefs = getProviderRefsFromBody(body);

    const tierId = await ctx.runMutation(api.entitlements.createTier, {
      guildId,
      name,
      description,
      roleIds,
      entitlementPolicy,
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
    const guildId = getRequiredBodyString(body, "guildId");
    const tierId = getRequiredBodyString(body, "tierId");
    const actorId = getRequiredBodyString(body, "actorId");
    const name = getOptionalBodyString(body, "name");
    const description = getOptionalBodyString(body, "description");
    const roleIds = getOptionalBodyStringArray(body, "roleIds");
    const entitlementPolicy = getEntitlementPolicyFromBody(body, false);
    const providerRefs = getProviderRefsFromBody(body);

    const updatedTierId = await ctx.runMutation(api.entitlements.updateTier, {
      guildId,
      tierId,
      name: name ?? undefined,
      description: description ?? undefined,
      roleIds: roleIds ?? undefined,
      entitlementPolicy: entitlementPolicy ?? undefined,
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
    const guildId = getRequiredParam(url, "guildId");
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
    const guildId = getRequiredParam(url, "guildId");
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
    const guildId = getRequiredParam(url, "guildId");
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
    const guildId = getRequiredParam(url, "guildId");
    const tiers = await ctx.runQuery(api.entitlements.getActiveMemberCountsByTier, {
      guildId,
    });
    return jsonResponse({ tiers });
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
    const guildId = getRequiredParam(url, "guildId");
    const scanLimit = getOptionalInteger(url, "scanLimit");
    const summary = await ctx.runQuery(
      api.providerEvents.getLatestProviderEventsForGuild,
      {
        guildId,
        scanLimit,
      }
    );
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
    const guildId = getRequiredParam(url, "guildId");
    const diagnostics = await ctx.runQuery(
      api.diagnostics.getGuildDiagnostics,
      {
        guildId,
      }
    );
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
    const guildId = getRequiredParam(url, "guildId");
    const limit = getOptionalInteger(url, "limit");
    const deliveries = await ctx.runQuery(
      api.outboundWebhooks.listFailedOutboundWebhookDeliveries,
      {
        guildId,
        limit,
      }
    );
    return jsonResponse({ deliveries });
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
    const guildId = getRequiredBodyString(body, "guildId");
    const tierId = getRequiredBodyString(body, "tierId");
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
    const guildId = getRequiredBodyString(body, "guildId");
    const grantId = getRequiredBodyString(body, "grantId");
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
    const guildId = getRequiredBodyString(body, "guildId");
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
