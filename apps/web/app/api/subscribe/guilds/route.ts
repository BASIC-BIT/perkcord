import { NextResponse } from "next/server";
import {
  buildDiscordAuthorizeUrl,
  createDiscordState,
  DISCORD_GUILD_OAUTH_SCOPES,
  DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE,
  DISCORD_MEMBER_OAUTH_STATE_COOKIE,
} from "@/lib/discordOAuth";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";

const resolveReturnTo = (params: URLSearchParams) => {
  const returnTo = params.get("returnTo");
  if (!returnTo) {
    return "/subscribe/select";
  }
  return returnTo.startsWith("/") ? returnTo : "/subscribe/select";
};

export async function GET(request: Request) {
  const secure = process.env.NODE_ENV === "production";
  const { searchParams } = new URL(request.url);

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

  const state = createDiscordState();
  const returnTo = resolveReturnTo(searchParams);
  const contextValue = Buffer.from(
    JSON.stringify({ flow: "guild_picker", returnTo }),
  ).toString("base64url");

  const redirectUrl = buildDiscordAuthorizeUrl(state, {
    scope: DISCORD_GUILD_OAUTH_SCOPES,
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
