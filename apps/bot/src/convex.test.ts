import { describe, expect, it, vi } from "vitest";

const clientConstructor = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation((url: string) => {
    clientConstructor(url);
    return { url };
  }),
}));

import { createConvexClient } from "./convex";

describe("createConvexClient", () => {
  it("constructs a Convex client with the provided URL", () => {
    const client = createConvexClient("https://convex.example");
    expect(client).toEqual({ url: "https://convex.example" });
    expect(clientConstructor).toHaveBeenCalledWith("https://convex.example");
  });
});
