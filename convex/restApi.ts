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
