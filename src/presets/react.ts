import { CommandGenerator, Preset } from "@/types"

export const react: CommandGenerator = (presets: Preset[]) => [
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
