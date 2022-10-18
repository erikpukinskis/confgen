import type { Presets, CommandGenerator } from "@/commands"

export const generator: CommandGenerator = ({ presets }) => [
  {
    command: "file",
    path: ".gitignore",
    contents: getIgnoreList(presets),
  },
]

const getIgnoreList = (presets: Presets) => {
  const ignore = ["node_modules", ".DS_Store", "dist", "vendor"]

  if (presets.includes("yarn")) {
    ignore.push("yarn-error.log")
  }

  if (presets.includes("codedocs")) {
    ignore.push("site")
  }

  return ignore
}
