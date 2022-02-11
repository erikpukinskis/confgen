import { CommandGenerator } from "./types"

export const yarn: CommandGenerator = () => [
  {
    command: "rm",
    path: "package-lock.json",
  },
  {
    command: "run",
    script: "rm -rf node_modules; yarn",
  },
]
