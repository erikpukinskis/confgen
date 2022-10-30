import type { CommandGenerator } from "~/commands"

export const generator: CommandGenerator = ({ presets }) => [
  {
    command: "yarn",
    pkg: "react",
  },
  ...(presets.includes("typescript")
    ? ([
        {
          command: "yarn",
          pkg: "@types/react",
          dev: true,
        },
      ] as const)
    : []),
]
