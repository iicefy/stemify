import { defineConfig } from "vitest/config";

// Unit tests for the pure logic in every workspace (no DOM, no database).
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});
