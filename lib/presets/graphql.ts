import type { Contribution, ProduceContributions } from "../contributions.js"
import type { Selection } from "../selection.js"

const GRAPHQL_VERSION = "16.11.0"

/** GraphQL owns schema generation, client documents, and new-service setup. */
export const contributions: ProduceContributions = (selection, facts) => {
  const produced: Contribution[] = [
    dependency("package.json", "dependencies", "graphql", GRAPHQL_VERSION),
    dependency(
      "package.json",
      "devDependencies",
      "@graphql-codegen/cli",
      "7.4.6"
    ),
    dependency(
      "package.json",
      "devDependencies",
      "@graphql-codegen/typescript",
      "6.1.2"
    ),
    dependency(
      "package.json",
      "devDependencies",
      "@graphql-codegen/typescript-resolvers",
      "6.1.1"
    ),
    dependency(
      "package.json",
      "devDependencies",
      "@graphql-codegen/add",
      "7.1.1"
    ),
    script("build:generate", "graphql-codegen"),
    starter("codegen", "codegen.yml", codegenYaml(selection)),
    starter("schema", "gql/schema.graphql", SCHEMA),
    starter("graphql-module", "gql/index.ts", GRAPHQL_MODULE),
    ...(!selection.presets.includes("vite")
      ? [starter("raw-module", "gql/raw-modules.d.ts", RAW_MODULE)]
      : []),
    ...(!selection.presets.includes("vite")
      ? [
          wholeFile(
            "raw-register",
            "gql/registerGraphqlRaw.mjs",
            REGISTER_GRAPHQL_RAW
          ),
          wholeFile(
            "raw-loader",
            "gql/graphqlRawLoader.mjs",
            GRAPHQL_RAW_LOADER
          ),
        ]
      : []),
  ]
  const serverScaffold =
    selection.runtimes.includes("server") &&
    facts.hasApplicationServerInitServer !== true
  if (serverScaffold) {
    produced.push(
      dependency("package.json", "dependencies", "@apollo/server", "^4.9.5"),
      dependency("package.json", "dependencies", "cors", "^2.8.5"),
      dependency("package.json", "dependencies", "express", "^5.0.0"),
      dependency("package.json", "devDependencies", "@types/cors", "^2.8.17"),
      dependency("package.json", "devDependencies", "@types/express", "5.0.0"),
      starter("server-queries", "server/queries/index.ts", QUERY_BARREL),
      starter("server-mutations", "server/mutations/index.ts", EMPTY_BARREL),
      starter("server-init", "server/initServer.ts", SERVER_INIT)
    )
    produced.push(
      starter(
        "server-greeting",
        "server/queries/greeting.ts",
        GREETING_RESOLVER
      )
    )
    if (selection.presets.includes("vitest")) {
      produced.push(
        starter(
          "server-greeting-test",
          "server/queries/greeting.test.ts",
          GREETING_RESOLVER_TEST
        )
      )
    }
  }
  if (selection.runtimes.includes("client")) {
    produced.push(
      dependency(
        "package.json",
        "devDependencies",
        "@graphql-codegen/client-preset",
        "6.2.3"
      ),
      dependency(
        "package.json",
        "devDependencies",
        "@graphql-typed-document-node/core",
        "3.2.0"
      ),
      dependency(
        "client/package.json",
        "dependencies",
        "@graphql-typed-document-node/core",
        "3.2.0"
      ),
      dependency(
        "client/package.json",
        "peerDependencies",
        "graphql",
        `^${GRAPHQL_VERSION}`
      ),
      starter("client-module", "gql/client/index.ts", CLIENT_MODULE),
      starter("client-operations", "client/index.ts", CLIENT_OPERATIONS)
    )
  }
  if (serverScaffold && selection.runtimes.includes("lib")) {
    produced.push(starter("test-kit", "lib/test.ts", TEST_KIT))
  }
  return produced
}

const SCHEMA = `type Query {
  greeting(name: String!): String!
}
`

const QUERY_BARREL = `export { greeting } from "./greeting.js"
`

const EMPTY_BARREL = `export {}
`

const GREETING_RESOLVER = `import type { QueryResolvers } from "#gql/index"

export function greetingMessage(name: string): string {
  return \`Hello, \${name}\`
}

export const greeting: NonNullable<QueryResolvers["greeting"]> = (
  parent,
  args
) => {
  void parent
  return greetingMessage(args.name)
}
`

const SERVER_INIT = `import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import cors from "cors"
import express from "express"
import { schema } from "#gql/index"
import * as Mutation from "#server/mutations/index"
import * as Query from "#server/queries/index"

export async function initServer() {
  const app = express()
  const apolloServer = new ApolloServer({
    typeDefs: schema,
    resolvers: {
      Query,
      ...(Object.keys(Mutation).length > 0 ? { Mutation } : {}),
    },
  })

  await apolloServer.start()

  app.get("/", (_, res) => {
    res.send("Hello, baseline")
  })

  app.get("/healthcheck", (_, res) => {
    res.send("ok")
  })

  app.use(
    "/api",
    cors(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async () => ({}),
    }) as unknown as express.RequestHandler
  )

  return { express: app, apollo: apolloServer }
}
`

const GRAPHQL_MODULE = `import schema from "./schema.graphql?raw"

export { schema }
export type { QueryResolvers } from "./_generated/resolvers.js"
`

const RAW_MODULE = `declare module "*.graphql?raw" {
  const content: string
  export default content
}
`

const REGISTER_GRAPHQL_RAW = `import { register } from "node:module"

register("./graphqlRawLoader.mjs", import.meta.url)
`

/**
 * Node loader for the single specifier suffix `.graphql?raw`.
 * Vite already inlines that import; this is only for `node --watch`.
 */
const GRAPHQL_RAW_LOADER = `import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.endsWith(".graphql?raw"))
    return nextResolve(specifier, context)
  return {
    url: new URL(specifier, context.parentURL).href,
    shortCircuit: true,
  }
}

export async function load(url, context, nextLoad) {
  const parsed = new URL(url)
  if (!(parsed.pathname.endsWith(".graphql") && parsed.search === "?raw")) {
    return nextLoad(url, context)
  }
  parsed.search = ""
  const source = readFileSync(fileURLToPath(parsed), "utf8")
  return {
    format: "module",
    source: "export default " + JSON.stringify(source) + "\\n",
    shortCircuit: true,
  }
}
`

const CLIENT_MODULE = `export { graphql } from "./_generated/gql.js"
`

const CLIENT_OPERATIONS = `import { graphql } from "../gql/client/index.js"

export const Greeting = graphql(\`
  query Greeting($name: String!) {
    greeting(name: $name)
  }
\`)
`

const TEST_KIT = `import { schema } from "#gql/index"
import { greeting } from "#server/queries/index"

export function serviceTestKit(): {
  schema: string
  greeting: typeof greeting
} {
  return { schema, greeting }
}
`

const GREETING_RESOLVER_TEST = `import { expect, test } from "vitest"
import { greetingMessage } from "#server/queries/greeting"

test("greeting resolver uses the name", () => {
  expect(greetingMessage("package")).toBe("Hello, package")
})
`

function codegenYaml(selection: Selection): string {
  const lines = [
    "schema: gql/schema.graphql",
    "ignoreNoDocuments: true",
    "emitLegacyCommonJSImports: false",
    "generates:",
    "  gql/_generated/resolvers.ts:",
    "    config:",
    "      avoidOptionals: true",
    "      enumsAsTypes: true",
    "      useTypeImports: true",
    "    plugins:",
    "      - add:",
    '          content: "// @ts-nocheck"',
    "      - typescript",
    "      - typescript-resolvers",
  ]
  if (selection.runtimes.includes("client")) {
    lines.push(
      "  gql/client/_generated/:",
      "    documents:",
      "      - client/**/*.ts",
      '      - "!client/dist/**"',
      '      - "!**/_generated/**"',
      "    preset: client",
      "    config:",
      "      enumsAsTypes: true",
      "      useTypeImports: true"
    )
  }
  return `${lines.join("\n")}\n`
}

function wholeFile(id: string, path: string, contents: string): Contribution {
  return {
    id: `graphql:${id}`,
    source: "preset:graphql",
    kind: "whole-file",
    path,
    contents,
  }
}

function starter(id: string, path: string, contents: string): Contribution {
  return {
    id: `graphql:starter:${id}`,
    source: "preset:graphql",
    kind: "starter-file",
    path,
    contents,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `graphql:script:${name}`,
    source: "preset:graphql",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}

function dependency(
  manifest: string,
  section: "dependencies" | "devDependencies" | "peerDependencies",
  name: string,
  range: string
): Contribution {
  return {
    id: `graphql:dependency:${manifest}:${section}:${name}`,
    source: "preset:graphql",
    kind: "dependency",
    manifest,
    section,
    package: name,
    range,
  }
}
