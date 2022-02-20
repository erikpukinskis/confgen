import { CommandGenerator } from "@/types"

export const git: CommandGenerator = () => [
  {
    command: "file",
    path: ".gitignore",
    contents: ["node_modules", ".DS_Store", "dist", "vendor"],
  },
]
