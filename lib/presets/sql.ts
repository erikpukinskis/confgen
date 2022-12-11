import type { CommandGenerator } from "~/commands"

export const generator: CommandGenerator = () => [
  {
    command: "yarn",
    pkg: "vite-plugin-babel-macros",
    dev: true,
  },
]
