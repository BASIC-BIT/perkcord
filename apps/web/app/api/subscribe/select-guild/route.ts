import { NextRequest, NextResponse } from "next/server";
import {
  MEMBER_GUILD_COOKIE,
  MEMBER_GUILD_COOKIE_MAX_AGE_SECONDS,
  MEMBER_GUILD_OAUTH_TOKEN_COOKIE,
} from "@/lib/guildSelection";

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
    return "/subscribe";
  }
  return value.startsWith("/") ? value : "/subscribe";
};

export async function POST(request: NextRequest) {
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
  response.cookies.set(MEMBER_GUILD_COOKIE, guildId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MEMBER_GUILD_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set(MEMBER_GUILD_OAUTH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
