import { CommandGenerator, Presets } from "@/types"

export const react: CommandGenerator = (presets: Presets) => [
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
