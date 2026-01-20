import { NextRequest, NextResponse } from "next/server";
import {
  DISCORD_OAUTH_STATE_COOKIE,
  DISCORD_OAUTH_RETURN_COOKIE,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "@/lib/discordOAuth";
import { encodeDiscordAccessToken } from "@/lib/discordTokens";
import { ADMIN_DISCORD_TOKEN_COOKIE } from "@/lib/guildSelection";
import { ADMIN_SESSION_COOKIE, encodeSession, type AdminSession } from "@/lib/session";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(DISCORD_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "Discord OAuth validation failed." }, { status: 400 });
  }

  let sessionSecret: string;
  try {
    sessionSecret = requireEnv(
      "PERKCORD_SESSION_SECRET",
      "PERKCORD_SESSION_SECRET is not configured.",
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: resolveEnvError(error, "PERKCORD_SESSION_SECRET is not configured."),
      },
      { status: 500 },
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
    const returnTo =
      request.cookies.get(DISCORD_OAUTH_RETURN_COOKIE)?.value ?? "/admin";
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.set(ADMIN_SESSION_COOKIE, encodeSession(session, sessionSecret), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    try {
      const expiresAt = Date.now() + token.expires_in * 1000;
      response.cookies.set(
        ADMIN_DISCORD_TOKEN_COOKIE,
        encodeDiscordAccessToken({ accessToken: token.access_token, expiresAt }),
        {
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
          maxAge: token.expires_in,
        },
      );
    } catch {
      // If encryption is unavailable, continue without storing the token cookie.
    }
    response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(DISCORD_OAUTH_RETURN_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to complete Discord OAuth." }, { status: 500 });
  }
}
