import { CommandGenerator, Preset } from "@/types"

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
  ...(args.apollo[0] === "source"
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "graphql-codegen-schema-script",
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "build:generate",
    script: "rm ./src/__generated__/*; graphql-codegen",
  },
  {
    command: "file",
    path: ".gitignore",
    contents: ["__generated__"],
  },
  ...(presets.includes("typescript")
    ? ([
        {
          command: "file",
          path: "codegen.yml",
          contents: buildCodegen(args),
        },
      ] as const)
    : []),
]

const buildCodegen = (args: Record<Preset, string[]>) => {
  let yml = `
schema: schema.graphql
generates:
  ./src/__generated__/types.ts:
    config:
      contextType: ResolverContext
    plugins:
      - typescript
      - typescript-resolvers
      - add:
          content: "import { ResolverContext } from '../context';"
`
  if (args.apollo[0] === "schema") {
    yml += `  ./src/__generated__/schema.ts:
    - graphql-codegen-schema-script
`
  }
  return yml
}
