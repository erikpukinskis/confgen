import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["integration-tests/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 300_000,
  },
})
