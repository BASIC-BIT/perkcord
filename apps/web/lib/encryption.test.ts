import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./encryption";

const KEY_ENV = "PERKCORD_OAUTH_ENCRYPTION_KEY";
const TEST_KEY = Buffer.alloc(32, 7).toString("base64url");

describe("encryption helpers", () => {
  const originalKey = process.env[KEY_ENV];

  beforeEach(() => {
    process.env[KEY_ENV] = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env[KEY_ENV];
    } else {
      process.env[KEY_ENV] = originalKey;
    }
  });

  it("roundtrips encrypted payloads", () => {
    const encrypted = encryptSecret("member-token");
    expect(encrypted).not.toContain("member-token");
    expect(decryptSecret(encrypted)).toBe("member-token");
  });

  it("rejects empty values", () => {
    expect(() => encryptSecret("")).toThrow("Cannot encrypt an empty value.");
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-valid")).toThrow("Invalid encrypted payload format.");
  });

  it("errors when the encryption key is missing", () => {
    delete process.env[KEY_ENV];
    expect(() => encryptSecret("value")).toThrow(
      "PERKCORD_OAUTH_ENCRYPTION_KEY is not configured.",
    );
  });
});
