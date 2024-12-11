import type { CommandGenerator, CommandWithArgs, Precheck } from "~/commands"
import { formatTypescript } from "~/format"
import type { JsonObject } from "~/helpers/json"
import { type Runtime, isRuntime } from "~/runtimes"

const GENERATORS = ["resolvers", "schema", "operations"] as const

type Generator = typeof GENERATORS[number]

const isGenerator = (string: string): string is Generator =>
  GENERATORS.includes(string as Generator)

export const precheck: Precheck = ({ presets, args }) => {
  const [runtime, ...generators] = args.codegen

  if (!presets.includes("typescript")) {
    throw new Error(
      'GraphQL codegen only makes sense in a Typescript project. Add the "typescript" preset to your confgen.'
    )
  }

  if (!isRuntime(runtime)) {
    throw new Error(
      "The codegen preset needs a runtime target as its first arg. Try codegen:lib:..., codegen:app:..., etc"
    )
  }

  if (generators.length < 1) {
    throw new Error(
      `The codegen presets needs to know what to runtime generate in.\n\nTry some combination of codegen:${runtime}:resolvers:schema:operations`
    )
  }

  for (const generator of generators) {
    if (!isGenerator(generator)) {
      throw new Error(
        `${generator} is not a known GraphQL code generator.\n\nTry some combination of codegen:${runtime}:resolvers:schema:operations`
      )
    }
  }
}

export const generator: CommandGenerator = async ({
  args,
  system,
  presets,
}) => {
  const [runtime, ...generators] = args.codegen as [Runtime, ...Generator[]]

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
      command: "script",
      name: "build:generate",
      script: `graphql-codegen`,
    },
    {
      command: "file",
      path: ".gitignore",
      contents: [`${runtime}/gql/`],
    },
    {
      command: "file",
      path: "codegen.yml",
      contents: getHooksCodegen(generators),
    },
    {
      command: "file",
      path: ".devcontainer/devcontainer.json",
      contents: {
        extensions: ["graphql.vscode-graphql"],
      },
    },
  ]

  if (presets.includes("codespaces")) {
    commands.push({
      command: "file",
      path: ".vscode/tasks.json",
      accessor: "tasks[label=GraphQL Codegen Watch]",
      contents: {
        label: "GraphQL Codegen Watch",
        type: "npm",
        script: "build:generate:watch",
        group: "build",
        runOptions: {
          runOn: "folderOpen",
        },
      },
    })
  }

  if (generators.includes("resolvers")) {
    commands.push(
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
        path: `${runtime}/context.ts`,
        merge: "if-not-exists",
        contents: await formatTypescript(`
            export type ResolverContext = {
              db: "..." // replace with your resolver context
            }`),
      },
      {
        command: "file",
        path: "codegen.yml",
        contents: getResolverCodegen(runtime),
      }
    )
  }

  if (generators.includes("schema") && !system.exists("schema.graphql")) {
    commands.push({
      command: "file",
      path: "schema.graphql",
      contents: getSampleSchema(),
    })
  }

  if (generators.includes("schema")) {
    commands.push(
      {
        command: "yarn",
        pkg: "graphql-codegen-schema-script",
        dev: true,
      },
      {
        command: "file",
        path: "codegen.yml",
        contents: getSchemaCodegen(runtime),
      }
    )
  }

  if (generators.includes("operations")) {
    commands.push(
      {
        command: "yarn",
        pkg: "@graphql-codegen/client-preset",
        dev: true,
      },
      {
        command: "file",
        path: "codegen.yml",
        contents: getOperationsCodegen(runtime),
      }
    )
  }

  return commands
}

const getSampleSchema = () => `type ExampleResponse {
  message: String!
}

type Query {
  exampleQuery(text: String!): ExampleResponse!
}

type Mutation {
  exampleMutation(text: String!): ExampleResponse!
}
`

const getOperationsCodegen = (runtime: Runtime) => ({
  documents: [`${runtime}/**/*.{ts,tsx}`],
  generates: {
    [`./${runtime}/gql/`]: {
      preset: "client",
    },
  },
})

const getSchemaCodegen = (runtime: Runtime) => ({
  schema: "schema.graphql",
  generates: {
    [`./${runtime}/gql/schema.ts`]: {
      plugins: ["graphql-codegen-schema-script"],
    },
  },
})

const getHooksCodegen = (generators: Generator[]): JsonObject => {
  let command = ""
  if (generators.includes("schema")) {
    command += '\\nexport { default as schema } from \\"./schema\\"'
  }
  if (generators.includes("resolvers")) {
    command +=
      '\\nexport { MutationResolvers, QueryResolvers } from \\"./resolvers\\"'
  }

  if (!command) return {}

  return {
    hooks: {
      afterAllFileWrite: `printf "${command}\\n" >> lib/gql/index.ts`,
    },
  }
}

const getResolverCodegen = (runtime: Runtime) => ({
  generates: {
    [`./${runtime}/gql/resolvers.ts`]: {
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
  },
})
