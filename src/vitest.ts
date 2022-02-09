import { Configgen } from "./types"

export const vitest: Configgen = () => ({
  "yarn:dev:vitest": "latest",
  "script:test": "vitest run",
  "script:test:watch": "vitest watch",
})
