import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["integration-tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "integration-tests/fixtures/**"],
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 1_500_000,
    env: {
      YARN_ENABLE_GLOBAL_CACHE: "true",
      YARN_GLOBAL_FOLDER: fileURLToPath(
        new URL("../.yarn-global-cache-for-tests/", import.meta.url),
      ),
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    },
  },
})
