import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

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
      roleConnectionsStatus: "error",
      roleConnectionsMessage: resolveEnvError(error, "Session secret missing."),
    });
  }

  const session = getSessionFromCookies(cookies(), secret);
  if (!session) {
    return buildRedirect(request, {
      roleConnectionsStatus: "error",
      roleConnectionsMessage: "Unauthorized.",
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
      roleConnectionsStatus: "error",
      roleConnectionsMessage: resolveEnvError(
        error,
        "Convex REST configuration missing."
      ),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildRedirect(request, {
      roleConnectionsStatus: "error",
      roleConnectionsMessage: "Invalid form submission.",
    });
  }

  const guildId = readFormValue(form, "guildId");
  if (!guildId) {
    return buildRedirect(request, {
      roleConnectionsStatus: "error",
      roleConnectionsMessage: "Guild ID is required.",
    });
  }

  const endpoint = `${normalizeBaseUrl(
    convexUrl
  )}/api/role-connections/metadata`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      body: JSON.stringify({
        guildId,
        actorId: session.userId,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error ??
        `Linked Roles registration failed with status ${response.status}.`;
      return buildRedirect(request, {
        roleConnectionsStatus: "error",
        roleConnectionsMessage: clampMessage(String(message)),
        guildId,
      });
    }

    return buildRedirect(request, {
      roleConnectionsStatus: "success",
      roleConnectionsCount: payload?.metadataCount
        ? String(payload.metadataCount)
        : undefined,
      guildId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Linked Roles registration failed.";
    return buildRedirect(request, {
      roleConnectionsStatus: "error",
      roleConnectionsMessage: clampMessage(message),
      guildId,
    });
  }
}
