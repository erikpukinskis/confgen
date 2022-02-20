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
    command: "yarn",
    dev: true,
    pkg: "graphql-codegen-schema-script",
  },
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
          contents: `
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
  ./src/__generated__/schema.ts:
    - graphql-codegen-plugin-schema-source.js
`,
        },
      ] as const)
    : []),
]
