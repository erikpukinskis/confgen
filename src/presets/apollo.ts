import { CommandGenerator, Args } from "@/types"

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
  ...(args.apollo[0] === "server"
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "@graphql-codegen/typescript-resolvers",
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "build:generate",
    script: "rm -f ./src/__generated__/*; graphql-codegen",
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
          contents: buildCodegenContents(args),
        },
      ] as const)
    : []),
]

const buildCodegenContents = (args: Args) => {
  const typesConfig = {
    plugins: ["typescript"],
  } as CodegenConfig

  if (args.apollo[0] === "server") {
    typesConfig.config = {
      contextType: "ResolverContext",
    }
    typesConfig.plugins.push("typescript-resolvers", {
      add: {
        content: "import { ResolverContext } from '../context';",
      },
    })
  }

  const srcDir = args.devServer[0] || "src"
  return {
    generates: {
      [`./${srcDir}/__generated__/types.ts`]: typesConfig,
    },
  }
}

type CodegenConfig = {
  plugins: (string | Record<string, { content: string }>)[]
  config?: {
    contextType: string
  }
}
