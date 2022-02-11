import { CommandGenerator } from "@/types"

export const vitest: CommandGenerator = () => [
  {
    command: "yarn",
    dev: true,
    pkg: "vitest",
  },
  {
    command: "script",
    name: "test",
    script: "vitest run",
  },
  {
    command: "script",
    name: "test:watch",
    script: "vitest watch",
  },
]
