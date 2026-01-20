import { NextResponse } from "next/server";
import {
  buildDiscordAuthorizeUrl,
  createDiscordState,
  DISCORD_OAUTH_STATE_COOKIE,
  DISCORD_OAUTH_RETURN_COOKIE,
} from "@/lib/discordOAuth";

const resolveReturnTo = (request: Request) => {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo");
  if (!returnTo) {
    return null;
  }
  return returnTo.startsWith("/") ? returnTo : null;
};

export async function GET(request: Request) {
  const secure = process.env.NODE_ENV === "production";

  try {
    const state = createDiscordState();
    const redirectUrl = buildDiscordAuthorizeUrl(state);
    const response = NextResponse.redirect(redirectUrl);
    const returnTo = resolveReturnTo(request);
    response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    if (returnTo) {
      response.cookies.set(DISCORD_OAUTH_RETURN_COOKIE, returnTo, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Discord OAuth is not configured." }, { status: 500 });
  }
}
