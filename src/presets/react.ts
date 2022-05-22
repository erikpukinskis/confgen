import type { CommandGenerator } from "@/commands"

export const react: CommandGenerator = (presets) => [
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
