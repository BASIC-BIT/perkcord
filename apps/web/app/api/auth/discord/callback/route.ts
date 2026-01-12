import { NextResponse } from "next/server";
import {
  DISCORD_OAUTH_STATE_COOKIE,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "@/lib/discordOAuth";
import {
  ADMIN_SESSION_COOKIE,
  encodeSession,
  type AdminSession,
} from "@/lib/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(DISCORD_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json(
      { error: "Discord OAuth validation failed." },
      { status: 400 }
    );
  }

  const sessionSecret = process.env.PERKCORD_SESSION_SECRET?.trim();
  if (!sessionSecret) {
    return NextResponse.json(
      { error: "PERKCORD_SESSION_SECRET is not configured." },
      { status: 500 }
    );
  }

  try {
    const token = await exchangeDiscordCode(code);
    const user = await fetchDiscordUser(token.access_token);

    const session: AdminSession = {
      userId: user.id,
      username: user.global_name ?? user.username,
      avatar: user.avatar ?? null,
      issuedAt: Date.now(),
    };

    const secure = process.env.NODE_ENV === "production";
    const response = NextResponse.redirect(new URL("/admin", request.url));
    response.cookies.set(ADMIN_SESSION_COOKIE, encodeSession(session, sessionSecret), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to complete Discord OAuth." },
      { status: 500 }
    );
  }
}
