import type { CommandGenerator } from "@/commands"

export const api: CommandGenerator = (presets, args) => [
  ...(presets.includes("vite")
    ? ([
        {
          command: "yarn",
          pkg: "vite-node",
        },
        {
          command: "script",
          name: "start:api",
          script: `vite-node ${args.api[0]}`,
        },
      ] as const)
    : []),
]
