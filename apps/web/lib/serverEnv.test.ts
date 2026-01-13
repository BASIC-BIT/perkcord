import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { optionalEnv, requireEnv, resolveEnvError } from "./serverEnv";

const ORIGINAL_ENV = { ...process.env };

describe("serverEnv", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reads optional env values", () => {
    process.env.TEST_ENV = " value ";
    expect(optionalEnv("TEST_ENV")).toBe("value");
    process.env.TEST_ENV = "   ";
    expect(optionalEnv("TEST_ENV")).toBeUndefined();
    delete process.env.TEST_ENV;
    expect(optionalEnv("TEST_ENV")).toBeUndefined();
  });

  it("requires env values", () => {
    process.env.REQUIRED_ENV = "ok";
    expect(requireEnv("REQUIRED_ENV")).toBe("ok");
    delete process.env.REQUIRED_ENV;
    expect(() => requireEnv("REQUIRED_ENV")).toThrow("REQUIRED_ENV is not configured.");
  });

  it("resolves env errors safely", () => {
    const error = new Error("boom");
    expect(resolveEnvError(error, "fallback")).toBe("boom");
    expect(resolveEnvError("nope", "fallback")).toBe("fallback");
  });
});
