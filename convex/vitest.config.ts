import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "../coverage/convex",
      include: [
        "entitlements.ts",
        "stripeWebhooks.ts",
        "authorizeNetWebhooks.ts",
        "nmiWebhooks.ts",
      ],
      exclude: ["**/*.test.ts", "_generated/**"],
      thresholds: {
        branches: 70,
        functions: 100,
        lines: 88,
        statements: 88,
      },
    },
  },
});
