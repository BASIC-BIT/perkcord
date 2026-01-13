import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { optionalEnv, parseOptionalList, parsePositiveInt, requireEnv, requireUrl } from "./env";

const ORIGINAL_ENV = { ...process.env };

describe("env helpers", () => {
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
  });

  it("requires env values", () => {
    process.env.REQUIRED_ENV = "ok";
    expect(requireEnv("REQUIRED_ENV")).toBe("ok");
    delete process.env.REQUIRED_ENV;
    expect(() => requireEnv("REQUIRED_ENV")).toThrow("REQUIRED_ENV is required.");
  });

  it("validates required URLs", () => {
    process.env.CONVEX_URL = "https://example.com";
    expect(requireUrl("CONVEX_URL")).toBe("https://example.com");
    process.env.CONVEX_URL = "not-a-url";
    expect(() => requireUrl("CONVEX_URL")).toThrow("CONVEX_URL must be a valid URL.");
  });

  it("parses positive integers with fallback", () => {
    expect(parsePositiveInt(undefined, 5, "VALUE")).toBe(5);
    expect(parsePositiveInt("10", 5, "VALUE")).toBe(10);
    expect(() => parsePositiveInt("0", 5, "VALUE")).toThrow("VALUE must be a positive integer.");
  });

  it("parses optional lists", () => {
    expect(parseOptionalList(undefined)).toBeUndefined();
    expect(parseOptionalList("a, b, a, ,")).toEqual(["a", "b"]);
    expect(parseOptionalList(" , , ")).toBeUndefined();
  });
});
