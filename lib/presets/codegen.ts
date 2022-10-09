import type { CommandGenerator, CommandWithArgs, Precheck } from "@/commands"
import { type Build, isBuild } from "@/builds"

const GENERATORS = ["resolvers", "schema", "operations"] as const

type Generator = typeof GENERATORS[number]

const isGenerator = (string: string): string is Generator =>
  GENERATORS.includes(string as Generator)

export const precheck: Precheck = ({ presets, args }) => {
  const [build, ...generators] = args.codegen

  if (!presets.includes("typescript")) {
    throw new Error(
      'GraphQL codegen only makes sense in a Typescript project. Add the "typescript" preset to your confgen.'
    )
  }

  if (!isBuild(build)) {
    throw new Error(
      "The codegen preset needs a build target as its first arg. Try codegen:lib:..., codegen:app:..., etc"
    )
  }

  if (generators.length < 1) {
    throw new Error(
      `The codegen presets needs to know what to generate.\n\nTry some combination of codegen:${build}:resolvers:schema:operations`
    )
  }

  for (const generator of generators) {
    if (!isGenerator(generator)) {
      throw new Error(
        `${generator} is not a known GraphQL code generator.\n\n\n\nTry some combination of codegen:${build}:resolvers:schema:operations`
      )
    }
  }
}

export const generator: CommandGenerator = ({ args, system }) => {
  const [build, ...generators] = args.codegen as [Build, ...Generator[]]

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
      contents: [`./${build}/gql/`],
    },
    {
      command: "file",
      path: "codegen.yml",
      contents: buildHooksCodegen(generators),
    },
  ]

  if (generators.includes("resolvers")) {
    commands.push(
      ...([
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
          path: `${build}/context.ts`,
          merge: "if-not-exists",
          contents: `export type ResolverContext = {
  db: "..." // replace with your resolver context
}`,
        },
        {
          command: "file",
          path: "codegen.yml",
          contents: buildResolverCodegen(build),
        },
      ] as const)
    )
  }

  if (generators.includes("schema")) {
    commands.push(
      ...(system.exists("schema.graphql")
        ? []
        : ([
            {
              command: "file",
              path: "schema.graphql",
              contents: buildSampleSchema(),
            },
          ] as const)),
      {
        command: "yarn",
        pkg: "graphql-codegen-schema-script",
        dev: true,
      },
      {
        command: "file",
        path: "codegen.yml",
        contents: buildSchemaCodegen(build),
      }
    )
  }

  if (generators.includes("operations")) {
    commands.push(
      ...([
        {
          command: "yarn",
          pkg: "@apollo/client",
        },
        {
          command: "yarn",
          pkg: "@graphql-codegen/client-preset",
          dev: true,
        },
        {
          command: "file",
          path: "codegen.yml",
          contents: buildOperationsCodegen(build),
        },
      ] as const)
    )
  }

  return commands
}

const buildSampleSchema = () => `type ExampleResponse {
  message: String!
}

type Query {
  exampleQuery(text: String!): ExampleResponse!
}

type Mutation {
  exampleMutation(text: String!): ExampleResponse!
}
`

const buildOperationsCodegen = (build: Build) => ({
  documents: [`${build}/**/*.tsx`],
  generates: {
    [`./${build}/gql`]: {
      preset: "client",
    },
  },
})

const buildSchemaCodegen = (build: Build) => ({
  schema: "schema.graphql",
  generates: {
    [`./${build}/gql/schema.ts`]: ["graphql-codegen-schema-script"],
  },
})

const buildHooksCodegen = (generators: Generator[]) => {
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

const buildResolverCodegen = (build: Build) => ({
  generates: {
    [`./${build}/gql/resolvers.ts`]: {
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
