import { CommandGenerator } from "./types"

export const emotion: CommandGenerator = (presets) => [
  {
    command: "yarn",
    pkg: "emotion",
  },
  ...(presets.includes("vite")
    ? ([
        { "command": "yarn", dev: true, pkg: "vite-plugin-babel-macros" },
      ] as const)
    : []),
]
