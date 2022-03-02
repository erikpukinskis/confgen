import { CommandGenerator, Args } from "@/types"
import { existsSync, readFileSync } from "fs"
import YAML from "yaml"

export const codegen: CommandGenerator = (presets, args) => {
  if (!presets.includes("typescript")) {
    throw new Error(
      'GraphQL codegen only makes sense in a Typescript project. Add the "typescript" preset to your confgen.'
    )
  }

  if (args.codegen.length < 1) {
    throw new Error(
      "Codegen presets needs to know what to generate. Try codegen:resolvers, codegen:schema, codegen:operations, or some combination of the three (codegen:resolvers:schema:operations)"
    )
  }

  const commands: CommandWithArgs[] = [
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
      command: "file",
      path: "codegen.yml",
      contents: buildResolverCodegen(args),
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

  if (args.codegen.includes("resolvers")) {
    commands.push(
      ...[
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
      ]
    )
  }

  if (!confgenHasSchema()) {
    commands.push(
      ...[
        {
          command: "file",
          path: "schema.graphql",
          contents: `type Query {
  }
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
      ]
    )
  }

  if (args.codegen.includes("schema")) {
    commands.push(
      ...[
        {
          command: "yarn",
          pkg: "graphql-codegen-schema-script",
          dev: true,
        },
        {
          command: "file",
          path: "codegen.yml",
          contents: buildSchemaCodegen(),
        },
      ]
    )
  }

  if (args.codegen.includes("operations")) {
    commands.push(
      ...[
        {
          command: "yarn",
          pkg: "@graphql-codegen/gql-tag-operations-preset",
          dev: true,
        },
        {
          command: "file",
          path: "codegen.yml",
          contents: buildOperationsCodegen(),
        },
      ]
    )
  }

  return commands
}

const buildOperationsCodegen = () => ({
  documents: ["src/**/*.tsx"],
  generates: {
    "./src/__generated__/": {
      preset: "gql-tag-operations-preset",
    },
  },
})

const buildSchemaCodegen = () => ({
  generates: {
    "./src/__generated__/schema.ts": ["graphql-codegen-schema-script"],
    "./src/__generated__/index.ts": {
      plugins: [
        {
          add: {
            content: `export { default as schema } from "./schema" //@schemaExport`,
          },
        },
      ],
    },
  },
})

const buildResolverCodegen = (args: Args) => {
  const srcDir = args.devServer[0] || "src"

  return {
    generates: {
      [`./${srcDir}/__generated__/resolvers.ts`]: {
        plugins: [
          "typescript",
          "typescript-resolvers",
          {
            add: {
              content:
                "import { ResolverContext } from '../context'; //@contextType",
            },
          },
        ],
        config: {
          contextType: "ResolverContext",
        },
      },

      "./src/__generated__/index.ts": {
        plugins: [
          {
            add: {
              content: `export { MutationResolvers, QueryResolvers } from "./resolvers" //@resolversExport`,
            },
          },
        ],
      },
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
