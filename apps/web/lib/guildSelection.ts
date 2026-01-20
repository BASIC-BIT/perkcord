export const ADMIN_GUILD_COOKIE = "perkcord_admin_guild";
export const MEMBER_GUILD_COOKIE = "perkcord_member_guild";
export const ADMIN_DISCORD_TOKEN_COOKIE = "perkcord_admin_discord_token";
export const MEMBER_GUILD_OAUTH_TOKEN_COOKIE = "perkcord_member_guild_oauth";

export const ADMIN_GUILD_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MEMBER_GUILD_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};

const getCookieValue = (store: CookieStore, name: string) =>
  store.get(name)?.value ?? null;

export const getAdminGuildIdFromCookies = (store: CookieStore) =>
  getCookieValue(store, ADMIN_GUILD_COOKIE);

export const getMemberGuildIdFromCookies = (store: CookieStore) =>
  getCookieValue(store, MEMBER_GUILD_COOKIE);

export const getAdminDiscordTokenFromCookies = (store: CookieStore) =>
  getCookieValue(store, ADMIN_DISCORD_TOKEN_COOKIE);

export const getMemberGuildTokenFromCookies = (store: CookieStore) =>
  getCookieValue(store, MEMBER_GUILD_OAUTH_TOKEN_COOKIE);
