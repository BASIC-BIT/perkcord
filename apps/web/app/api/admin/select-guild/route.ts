import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_GUILD_COOKIE,
  ADMIN_GUILD_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/guildSelection";
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

const resolveReturnTo = (value: string | null) => {
  if (!value) {
    return "/admin/overview";
  }
  return value.startsWith("/") ? value : "/admin/overview";
};

export async function POST(request: NextRequest) {
  let sessionSecret: string;
  try {
    sessionSecret = requireEnv(
      "PERKCORD_SESSION_SECRET",
      "PERKCORD_SESSION_SECRET is not configured.",
    );
  } catch (error) {
    return NextResponse.json(
      { error: resolveEnvError(error, "PERKCORD_SESSION_SECRET is not configured.") },
      { status: 500 },
    );
  }

  const session = getSessionFromCookies(request.cookies, sessionSecret);
  if (!session) {
    return NextResponse.json({ error: "Admin session is required." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid guild selection." }, { status: 400 });
  }

  const guildId = readFormValue(form, "guildId");
  if (!guildId) {
    return NextResponse.json({ error: "Guild selection is required." }, { status: 400 });
  }

  const returnTo = resolveReturnTo(readFormValue(form, "returnTo"));
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ADMIN_GUILD_COOKIE, guildId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_GUILD_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
