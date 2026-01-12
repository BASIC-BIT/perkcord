import { NextResponse } from "next/server";
import {
  buildDiscordAuthorizeUrl,
  createDiscordState,
  DISCORD_OAUTH_STATE_COOKIE,
} from "@/lib/discordOAuth";

export async function GET() {
  const secure = process.env.NODE_ENV === "production";

  try {
    const state = createDiscordState();
    const redirectUrl = buildDiscordAuthorizeUrl(state);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(DISCORD_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Discord OAuth is not configured." },
      { status: 500 }
    );
  }
}
