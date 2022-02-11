import { CommandGenerator } from "./types"

export const apollo: CommandGenerator = (presets, args) => [
{
  command: "yarn",
  dev: true,
  pkg: "graphql-codegen"
},
{
  command: "script",
  name: "build:generate",
  script: "graphql-codegen"
}
]