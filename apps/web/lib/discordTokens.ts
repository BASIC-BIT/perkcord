import { decryptSecret, encryptSecret } from "./encryption";

export type DiscordAccessToken = {
  accessToken: string;
  expiresAt: number;
};

export const encodeDiscordAccessToken = (token: DiscordAccessToken) =>
  encryptSecret(JSON.stringify(token));

export const decodeDiscordAccessToken = (value: string) => {
  try {
    const parsed = JSON.parse(decryptSecret(value)) as DiscordAccessToken;
    if (!parsed?.accessToken || !parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const isDiscordAccessTokenExpired = (token: DiscordAccessToken) =>
  token.expiresAt <= Date.now();
