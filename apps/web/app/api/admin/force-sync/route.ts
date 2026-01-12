import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

const allowedScopes = new Set(["guild", "user"]);

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

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = requireEnv("PERKCORD_SESSION_SECRET", "Session secret missing.");
  } catch (error) {
    return buildRedirect(request, {
      forceSync: "error",
      message: resolveEnvError(error, "Session secret missing."),
    });
  }

  const session = getSessionFromCookies(cookies(), secret);
  if (!session) {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Unauthorized.",
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
      forceSync: "error",
      message: resolveEnvError(error, "Convex REST configuration missing."),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Invalid form submission.",
    });
  }

  const guildId = readFormValue(form, "guildId");
  const scope = readFormValue(form, "scope");
  const discordUserId = readFormValue(form, "discordUserId");
  const reason = readFormValue(form, "reason");

  if (!guildId) {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Guild ID is required.",
    });
  }
  if (!scope || !allowedScopes.has(scope)) {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Scope must be guild or user.",
    });
  }
  if (scope === "user" && !discordUserId) {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Discord user ID is required for user scope.",
    });
  }
  if (scope === "guild" && discordUserId) {
    return buildRedirect(request, {
      forceSync: "error",
      message: "Discord user ID is only for user scope.",
    });
  }

  const endpoint = `${normalizeBaseUrl(convexUrl)}/api/role-sync`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      body: JSON.stringify({
        guildId,
        scope,
        discordUserId: discordUserId ?? undefined,
        actorId: session.userId,
        reason: reason ?? undefined,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error ??
        `Force sync failed with status ${response.status}.`;
      return buildRedirect(request, {
        forceSync: "error",
        message: clampMessage(String(message)),
      });
    }

    return buildRedirect(request, {
      forceSync: "success",
      requestId: payload?.requestId ? String(payload.requestId) : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Force sync request failed.";
    return buildRedirect(request, {
      forceSync: "error",
      message: clampMessage(message),
    });
  }
}
