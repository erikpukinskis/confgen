import type { CommandGenerator } from "@/commands"

export const yarn: CommandGenerator = () => [
  {
    command: "run",
    script: "rm -f package-lock.json",
  },
  {
    command: "run",
    script: "yarn",
  },
]
