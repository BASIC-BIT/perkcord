import { NextResponse } from "next/server";
import { ADMIN_DISCORD_TOKEN_COOKIE, ADMIN_GUILD_COOKIE } from "@/lib/guildSelection";
import { ADMIN_SESSION_COOKIE } from "@/lib/session";

const clearSession = (request: Request) => {
  const secure = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ADMIN_DISCORD_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ADMIN_GUILD_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
};

export async function GET(request: Request) {
  return clearSession(request);
}

export async function POST(request: Request) {
  return clearSession(request);
}
