import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import {
  DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE,
  DISCORD_MEMBER_OAUTH_STATE_COOKIE,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "@/lib/discordOAuth";
import { encryptSecret } from "@/lib/encryption";

type MemberOAuthContext = {
  guildId?: string;
  tier?: string | null;
  returnTo?: string | null;
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const decodeContext = (value: string): MemberOAuthContext | null => {
  try {
    const json = decodeBase64Url(value);
    return JSON.parse(json) as MemberOAuthContext;
  } catch {
    return null;
  }
};

const sanitizeReturnTo = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  return value.startsWith("/") ? value : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(DISCORD_MEMBER_OAUTH_STATE_COOKIE)
    ?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json(
      { error: "Discord OAuth validation failed." },
      { status: 400 }
    );
  }

  const contextRaw = request.cookies.get(
    DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE
  )?.value;
  const context = contextRaw ? decodeContext(contextRaw) : null;
  const discordGuildId =
    typeof context?.guildId === "string" ? context.guildId.trim() : "";
  if (!discordGuildId) {
    return NextResponse.json(
      { error: "Missing guild context for member OAuth." },
      { status: 400 }
    );
  }

  const redirectUri = process.env.DISCORD_MEMBER_REDIRECT_URI?.trim();
  if (!redirectUri) {
    return NextResponse.json(
      { error: "DISCORD_MEMBER_REDIRECT_URI is not configured." },
      { status: 500 }
    );
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  if (!convexUrl) {
    return NextResponse.json(
      { error: "CONVEX_URL is not configured." },
      { status: 500 }
    );
  }

  try {
    const token = await exchangeDiscordCode(code, redirectUri);
    if (!Number.isFinite(token.expires_in)) {
      throw new Error("Discord token expiry is missing.");
    }
    if (!token.refresh_token) {
      throw new Error("Discord refresh token is missing.");
    }

    const user = await fetchDiscordUser(token.access_token);
    const convex = new ConvexHttpClient(convexUrl);
    const guild = (await convex.query("guilds:getGuildByDiscordId", {
      discordGuildId,
    })) as { _id: string } | null;

    if (!guild?._id) {
      return NextResponse.json(
        { error: "Guild not found for member OAuth." },
        { status: 404 }
      );
    }

    const expiresAt = Date.now() + token.expires_in * 1000;
    await convex.mutation("members:upsertMemberIdentity", {
      guildId: guild._id,
      discordUserId: user.id,
      discordUsername: user.global_name ?? user.username,
      oauth: {
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        expiresAt,
      },
      actorType: "system",
      actorId: "member_oauth",
    });

    const fallbackReturn = new URL("/subscribe/pay", request.url);
    if (context?.tier) {
      fallbackReturn.searchParams.set("tier", context.tier);
    }
    fallbackReturn.searchParams.set("guildId", discordGuildId);
    const returnTo =
      sanitizeReturnTo(context?.returnTo) ??
      `${fallbackReturn.pathname}${fallbackReturn.search}`;

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.set(DISCORD_MEMBER_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(DISCORD_MEMBER_OAUTH_CONTEXT_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to complete member Discord OAuth." },
      { status: 500 }
    );
  }
}
