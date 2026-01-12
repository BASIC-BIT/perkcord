import { randomBytes } from "crypto";

export const DISCORD_OAUTH_STATE_COOKIE = "perkcord_discord_oauth_state";

type DiscordOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

const getOAuthConfig = (): DiscordOAuthConfig => {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const redirectUri = process.env.DISCORD_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Discord OAuth environment variables are missing.");
  }

  return { clientId, clientSecret, redirectUri };
};

export const createDiscordState = () => randomBytes(16).toString("hex");

export const buildDiscordAuthorizeUrl = (state: string) => {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "identify guilds",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
};

export const exchangeDiscordCode = async (
  code: string
): Promise<DiscordTokenResponse> => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Discord OAuth code.");
  }

  return (await response.json()) as DiscordTokenResponse;
};

export const fetchDiscordUser = async (
  accessToken: string
): Promise<DiscordUser> => {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Discord user profile.");
  }

  return (await response.json()) as DiscordUser;
};
