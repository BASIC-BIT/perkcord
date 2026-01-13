import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_MEMBER_OAUTH_SCOPES,
  buildDiscordAuthorizeUrl,
  createDiscordState,
  exchangeDiscordCode,
  fetchDiscordUser,
} from "./discordOAuth";

const ORIGINAL_ENV = { ...process.env };

const setDiscordEnv = () => {
  process.env.DISCORD_CLIENT_ID = "client-id";
  process.env.DISCORD_CLIENT_SECRET = "client-secret";
  process.env.DISCORD_REDIRECT_URI = "https://example.com/callback";
};

describe("discordOAuth", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a hex state", () => {
    const state = createDiscordState();
    expect(state).toMatch(/^[a-f0-9]{32}$/);
  });

  it("builds authorize URL with default scopes", () => {
    setDiscordEnv();
    const url = buildDiscordAuthorizeUrl("state");
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("discord.com");
    expect(parsed.searchParams.get("client_id")).toBe("client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
    expect(parsed.searchParams.get("scope")).toBe("identify guilds");
    expect(parsed.searchParams.get("state")).toBe("state");
  });

  it("builds authorize URL with custom scopes and redirect", () => {
    setDiscordEnv();
    const url = buildDiscordAuthorizeUrl("state", {
      scope: DISCORD_MEMBER_OAUTH_SCOPES,
      redirectUri: "https://example.com/member",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.com/member");
    expect(parsed.searchParams.get("scope")).toBe(DISCORD_MEMBER_OAUTH_SCOPES.join(" "));
  });

  it("throws when OAuth env is missing", () => {
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_REDIRECT_URI;
    expect(() => buildDiscordAuthorizeUrl("state")).toThrow(
      "Discord OAuth environment variables are missing.",
    );
  });

  it("exchanges OAuth code", async () => {
    setDiscordEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "token", token_type: "bearer", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await exchangeDiscordCode("code");
    expect(result.access_token).toBe("token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws when OAuth exchange fails", async () => {
    setDiscordEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(exchangeDiscordCode("code")).rejects.toThrow(
      "Failed to exchange Discord OAuth code.",
    );
  });

  it("fetches Discord user profile", async () => {
    setDiscordEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", username: "user" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchDiscordUser("token");
    expect(result.username).toBe("user");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws when user fetch fails", async () => {
    setDiscordEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(fetchDiscordUser("token")).rejects.toThrow(
      "Failed to fetch Discord user profile.",
    );
  });
});
