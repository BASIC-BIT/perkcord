import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  decodeSession,
  encodeSession,
  getSessionFromCookies,
} from "./session";

describe("session", () => {
  it("encodes and decodes admin session", () => {
    const session = {
      userId: "user",
      username: "admin",
      avatar: null,
      issuedAt: 1700000000000,
    };
    const token = encodeSession(session, "secret");
    const decoded = decodeSession(token, "secret");
    expect(decoded).toEqual(session);
  });

  it("returns null for invalid session token", () => {
    expect(decodeSession("bad.token", "secret")).toBeNull();
  });

  it("reads session from cookies", () => {
    const session = {
      userId: "user",
      username: "admin",
      avatar: null,
      issuedAt: 1700000000000,
    };
    const token = encodeSession(session, "secret");
    const cookieStore = {
      get: (name: string) => (name === ADMIN_SESSION_COOKIE ? { value: token } : undefined),
    };
    const decoded = getSessionFromCookies(cookieStore, "secret");
    expect(decoded).toEqual(session);
  });

  it("returns null for invalid JSON payloads", () => {
    const payload = Buffer.from("not-json").toString("base64url");
    const signature = createHmac("sha256", "secret").update(payload).digest("base64url");
    const token = `${payload}.${signature}`;
    expect(decodeSession(token, "secret")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const payload = Buffer.from(JSON.stringify({ userId: "only" })).toString("base64url");
    const signature = createHmac("sha256", "secret").update(payload).digest("base64url");
    const token = `${payload}.${signature}`;
    expect(decodeSession(token, "secret")).toBeNull();
  });

  it("returns null when cookie is missing", () => {
    const cookieStore = { get: () => undefined };
    const decoded = getSessionFromCookies(cookieStore, "secret");
    expect(decoded).toBeNull();
  });
});
