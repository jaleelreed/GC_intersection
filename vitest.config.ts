import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    // DB suites share one seeded database; learned-cost harvests (US-020/021)
    // would bleed across concurrently-running files and break determinism
    // assertions. Sequential files keep the shared-state reasoning simple.
    fileParallelism: false,
  },
});
