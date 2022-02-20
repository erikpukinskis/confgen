import { CommandGenerator } from "@/types"

export const apollo: CommandGenerator = (presets, args) => [
  {
    command: "yarn",
    dev: true,
    pkg: "@graphql-codegen/cli",
  },
  {
    command: "yarn",
    dev: true,
    pkg: "graphql",
  },
  {
    command: "script",
    name: "build:generate",
    script: "rm ./src/__generated__/*; graphql-codegen",
  },
  {
    file: ".gitignore",
    contents: [
      "__generated__"
    ]
  }
]
