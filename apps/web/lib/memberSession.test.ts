import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemberSession,
  decodeMemberSession,
  encodeMemberSession,
  getMemberSessionFromCookies,
  MEMBER_SESSION_COOKIE,
  MEMBER_SESSION_MAX_AGE_SECONDS,
} from "./memberSession";

describe("memberSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-13T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("encodes and decodes a session", () => {
    const session = createMemberSession("user", "guild");
    const token = encodeMemberSession(session, "secret");
    const decoded = decodeMemberSession(token, "secret");
    expect(decoded).toEqual(session);
  });

  it("returns null for invalid signature", () => {
    const session = createMemberSession("user", "guild");
    const token = encodeMemberSession(session, "secret");
    const tampered = `${token.split(".")[0]}.invalid`;
    expect(decodeMemberSession(tampered, "secret")).toBeNull();
  });

  it("returns null for expired session", () => {
    const session = createMemberSession("user", "guild");
    const token = encodeMemberSession(session, "secret");
    vi.advanceTimersByTime((MEMBER_SESSION_MAX_AGE_SECONDS + 10) * 1000);
    expect(decodeMemberSession(token, "secret")).toBeNull();
  });

  it("returns null when max age is exceeded", () => {
    const expiresAt = Date.now() + 1000;
    const issuedAt = expiresAt - (MEMBER_SESSION_MAX_AGE_SECONDS + 60) * 1000;
    const session = {
      discordUserId: "user",
      discordGuildId: "guild",
      issuedAt,
      expiresAt,
    };
    const token = encodeMemberSession(session, "secret");
    expect(decodeMemberSession(token, "secret")).toBeNull();
  });

  it("returns null for invalid JSON payloads", () => {
    const payload = Buffer.from("not-json").toString("base64url");
    const signature = createHmac("sha256", "secret").update(payload).digest("base64url");
    const token = `${payload}.${signature}`;
    expect(decodeMemberSession(token, "secret")).toBeNull();
  });

  it("reads session from cookies", () => {
    const session = createMemberSession("user", "guild");
    const token = encodeMemberSession(session, "secret");
    const cookieStore = {
      get: (name: string) => (name === MEMBER_SESSION_COOKIE ? { value: token } : undefined),
    };
    const decoded = getMemberSessionFromCookies(cookieStore, "secret");
    expect(decoded).toEqual(session);
  });

  it("returns null when required fields are missing", () => {
    const payload = Buffer.from(JSON.stringify({ discordUserId: "user" })).toString("base64url");
    const signature = createHmac("sha256", "secret").update(payload).digest("base64url");
    const token = `${payload}.${signature}`;
    expect(decodeMemberSession(token, "secret")).toBeNull();
  });

  it("returns null when cookies are missing", () => {
    const cookieStore = {
      get: () => undefined,
    };
    const decoded = getMemberSessionFromCookies(cookieStore, "secret");
    expect(decoded).toBeNull();
  });
});
