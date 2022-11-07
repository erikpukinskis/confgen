import type { CommandGenerator } from "~/commands"

export const generator: CommandGenerator = ({ presets }) => [
  {
    command: "package",
    pkg: "react",
  },
  ...(presets.includes("typescript")
    ? ([
        {
          command: "package",
          pkg: "@types/react",
          dev: true,
        },
      ] as const)
    : []),
]
