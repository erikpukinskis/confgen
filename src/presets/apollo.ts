import { CommandGenerator, Args } from "@/types"
import { existsSync, readFileSync } from "fs"
import YAML from "yaml"

export const apollo: CommandGenerator = (presets, args) => {
  if (!presets.includes("typescript")) {
    throw new Error(
      'Apollo codegen only makes sense in a typescript project. Add the "typescript" preset to your confgen.'
    )
  }
  return [
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
          {
            command: "yarn",
            dev: true,
            pkg: "@graphql-codegen/add",
          },
          {
            command: "file",
            path: "src/context.ts",
            merge: "if-not-exists",
            contents: `export type ResolverContext = {
  db: "..." // replace with your resolver context
}`,
          },
        ] as const)
      : []),
    ...(confgenHasSchema()
      ? []
      : ([
          {
            command: "file",
            path: "schema.graphql",
            contents: `type Query {
  hello: String!
}
`,
          },
          {
            command: "file",
            path: "codegen.yml",
            contents: {
              schema: "schema.graphql",
            },
          },
        ] as const)),
    {
      command: "file",
      path: "codegen.yml",
      contents: buildCodegenContents(args),
    },
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
  ]
}

const buildCodegenContents = (args: Args) => {
  const typesConfig = {
    plugins: ["typescript"],
  } as CodegenConfig

  typesConfig.config = {
    contextType: "ResolverContext",
  }
  typesConfig.plugins.push("typescript-resolvers", {
    add: {
      content: "import { ResolverContext } from '../context'; //@contextType",
    },
  })

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

const confgenHasSchema = () => {
  if (!existsSync("confgen.yml")) return false
  const contents = readFileSync("confgen.yml").toString()
  const object = YAML.parse(contents)
  return Boolean(object.schema)
}
