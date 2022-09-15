import type { CommandGenerator } from "@/commands"

export const generator: CommandGenerator = () => [
  {
    command: "file",
    merge: "prefer-existing",
    path: "package.json",
    contents: {
      license: "UNLICENSED",
    },
  },
  {
    command: "run",
    script: "rm -f package-lock.json",
  },
  {
    command: "run",
    script: "yarn",
  },
]
