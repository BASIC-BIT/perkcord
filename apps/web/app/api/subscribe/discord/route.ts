import { NextRequest, NextResponse } from "next/server";
import {
  buildDiscordAuthorizeUrl,
  createDiscordState,
  DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE,
  DISCORD_MEMBER_OAUTH_SCOPES,
  DISCORD_MEMBER_OAUTH_STATE_COOKIE,
} from "@/lib/discordOAuth";
import { getMemberGuildIdFromCookies } from "@/lib/guildSelection";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

const readParam = (params: URLSearchParams, key: string) => {
  const value = params.get(key);
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function GET(request: NextRequest) {
  const secure = process.env.NODE_ENV === "production";
  const { searchParams } = new URL(request.url);

  const guildId =
    readParam(searchParams, "guildId") ??
    readParam(searchParams, "guild") ??
    getMemberGuildIdFromCookies(request.cookies);
  if (!guildId) {
    return NextResponse.json({ error: "Select a server to connect Discord." }, { status: 400 });
  }

  let redirectUri: string;
  try {
    redirectUri = requireEnv(
      "DISCORD_MEMBER_REDIRECT_URI",
      "DISCORD_MEMBER_REDIRECT_URI is not configured.",
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: resolveEnvError(error, "DISCORD_MEMBER_REDIRECT_URI is not configured."),
      },
      { status: 500 },
    );
  }

  const tier = readParam(searchParams, "tier");
  const state = createDiscordState();
  const returnTo = readParam(searchParams, "returnTo");
  const fallbackReturn = new URL("/subscribe/pay", request.url);
  if (tier) {
    fallbackReturn.searchParams.set("tier", tier);
  }
  const safeReturnTo =
    returnTo && returnTo.startsWith("/")
      ? returnTo
      : `${fallbackReturn.pathname}${fallbackReturn.search}`;

  const context = {
    flow: "connect",
    guildId,
    tier,
    returnTo: safeReturnTo,
  };
  const contextValue = Buffer.from(JSON.stringify(context)).toString("base64url");

  const redirectUrl = buildDiscordAuthorizeUrl(state, {
    scope: DISCORD_MEMBER_OAUTH_SCOPES,
    redirectUri,
  });

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(DISCORD_MEMBER_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE, contextValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
