import { CommandGenerator } from "@/types"

export const git: CommandGenerator = (presets) => [
  {
    command: "file",
    path: ".gitignore",
    contents: ["node_modules", ".DS_Store", "dist", "vendor"],
  },
  ...(presets.includes("yarn")
    ? [
        {
          command: "file" as const,
          path: ".gitignore",
          contents: ["yarn-error.log"],
        },
      ]
    : []),
]
