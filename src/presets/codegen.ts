import {
  type CommandGenerator,
  type CommandWithArgs,
  type Precheck,
} from "@/commands"
import { type Args } from "@/args"
import type { System } from "@/system"
import YAML from "yaml"

export const precheck: Precheck = (presets, args) => {
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
}

export const generator: CommandGenerator = (presets, args, system) => {
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
      script: "rm -f ./src/__generated__/* && graphql-codegen",
    },
    {
      command: "file",
      path: ".gitignore",
      contents: ["__generated__"],
    },
  ]

  if (args.codegen.includes("resolvers")) {
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
          path: "src/context.ts",
          merge: "if-not-exists",
          contents: `export type ResolverContext = {
  db: "..." // replace with your resolver context
}`,
        },
        {
          command: "file",
          path: "codegen.yml",
          contents: buildResolverCodegen(args),
        },
      ] as const)
    )
  }

  if (!codegenHasSchema(system)) {
    commands.push(
      ...([
        {
          command: "file",
          path: "schema.graphql",
          contents: `type ExampleResponse {
  message: String!
}

type Query {
  exampleQuery(text: String!): ExampleResponse!
}

type Mutation {
  exampleMutation(text: String!): ExampleResponse!
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
      ] as const)
    )
  }

  if (args.codegen.includes("schema")) {
    commands.push(
      ...([
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
      ] as const)
    )
  }

  if (args.codegen.includes("operations")) {
    commands.push(
      ...([
        {
          command: "yarn",
          pkg: "@apollo/client",
        },
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
      ] as const)
    )

    if (!hasAnyOperations(system)) {
      let path = "src/index.tsx"
      if (system.exists(path)) {
        path = "src/example.tsx"
      }
      commands.push({
        command: "file",
        path,
        contents: buildExampleIndex(),
      })
    }
  }

  return commands
}

const hasAnyOperations = (system: System) => {
  const { status } = system.run("grep -rnw . -e 'gql('")
  return status === 0
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

const codegenHasSchema = (system: System) => {
  if (!system.exists("codegen.yml")) return false
  const contents = system.read("codegen.yml")
  const object = YAML.parse(contents)
  return Boolean(object.schema)
}

const buildExampleIndex = () => `import React from 'react'
import {
  ApolloProvider,
  ApolloClient,
  HttpLink,
  InMemoryCache,
  useQuery,
} from "@apollo/client"
import { gql } from "@/__generated__"
import fetch from "cross-fetch"

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    uri: \`\${window.location.protocol}//\${window.location.host}/graphql\`,
    fetch,
  }),
})

const EXAMPLE_OPERATION = gql(\`
  query ExampleOperation($text: String!) {
    exampleQuery(text: $text) {
      message
    }
  }
\`)

const Example = () => {
  const { data } = useQuery(EXAMPLE_OPERATION)
  return <>{data?.exampleQuery.message || "No data"}</>
}

export const App = () => (
  <ApolloProvider client={client}>
    <Example />
  </ApolloProvider>
)
`
