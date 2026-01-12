import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

const allowedStatuses = new Set([
  "active",
  "pending",
  "past_due",
  "canceled",
  "expired",
  "suspended_dispute",
]);

const readFormValue = (form: FormData, key: string) => {
  const value = form.get(key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildRedirect = (
  request: Request,
  params: Record<string, string | undefined>
) => {
  const url = new URL("/admin", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(url);
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const clampMessage = (value: string, max = 160) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

const parseOptionalDate = (value: string | null, label: string) => {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid date/time.`);
  }
  return timestamp;
};

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = requireEnv("PERKCORD_SESSION_SECRET", "Session secret missing.");
  } catch (error) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: resolveEnvError(error, "Session secret missing."),
    });
  }

  const session = getSessionFromCookies(cookies(), secret);
  if (!session) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Unauthorized.",
    });
  }

  let convexUrl: string;
  let apiKey: string;
  try {
    convexUrl = requireEnv(
      "PERKCORD_CONVEX_HTTP_URL",
      "Convex REST configuration missing."
    );
    apiKey = requireEnv(
      "PERKCORD_REST_API_KEY",
      "Convex REST configuration missing."
    );
  } catch (error) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: resolveEnvError(error, "Convex REST configuration missing."),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Invalid form submission.",
    });
  }

  const guildId = readFormValue(form, "guildId");
  const tierId = readFormValue(form, "tierId");
  const discordUserId = readFormValue(form, "discordUserId");
  const status = readFormValue(form, "status");
  const validFromRaw = readFormValue(form, "validFrom");
  const validThroughRaw = readFormValue(form, "validThrough");
  const note = readFormValue(form, "note");

  if (!guildId) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Guild ID is required.",
    });
  }
  if (!tierId) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Tier ID is required.",
      guildId,
    });
  }
  if (!discordUserId) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Discord user ID is required.",
      guildId,
    });
  }
  if (status && !allowedStatuses.has(status)) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Status must be a valid entitlement state.",
      guildId,
      memberId: discordUserId,
    });
  }

  let validFrom: number | undefined;
  let validThrough: number | undefined;
  try {
    validFrom = parseOptionalDate(validFromRaw, "Valid from");
    validThrough = parseOptionalDate(validThroughRaw, "Valid through");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date.";
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: clampMessage(message),
      guildId,
      memberId: discordUserId,
    });
  }

  if (
    validFrom !== undefined &&
    validThrough !== undefined &&
    validThrough < validFrom
  ) {
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: "Valid through must be after valid from.",
      guildId,
      memberId: discordUserId,
    });
  }

  const endpoint = `${normalizeBaseUrl(convexUrl)}/api/grants`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      body: JSON.stringify({
        guildId,
        tierId,
        discordUserId,
        actorId: session.userId,
        status: status ?? undefined,
        validFrom,
        validThrough,
        note: note ?? undefined,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error ?? `Manual grant failed with status ${response.status}.`;
      return buildRedirect(request, {
        grantAction: "create",
        grantStatus: "error",
        grantMessage: clampMessage(String(message)),
        guildId,
        memberId: discordUserId,
      });
    }

    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "success",
      grantId: payload?.grantId ? String(payload.grantId) : undefined,
      guildId,
      memberId: discordUserId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Manual grant failed.";
    return buildRedirect(request, {
      grantAction: "create",
      grantStatus: "error",
      grantMessage: clampMessage(message),
      guildId,
      memberId: discordUserId,
    });
  }
}
