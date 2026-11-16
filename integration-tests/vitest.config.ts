import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    env: { DEV_CLUSTER_VERSION: "file:.yalc/dev-cluster" },
    include: ["integration-tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "integration-tests/fixtures/**"],
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 300_000,
  },
})
