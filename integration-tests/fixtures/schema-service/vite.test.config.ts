import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: [
      "lib/**/*.test.ts",
      "server/**/*.test.ts",
      "client/**/*.test.ts",
      "gql/**/*.test.ts",
    ],
  },
})
