import type { Contribution, ProduceContributions } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
import { containerIdentity } from "./presets/docker.js"
import type { Selection } from "./selection.js"

export type RuntimeName =
  | "lib"
  | "app"
  | "server"
  | "client"
  | "integration"
  | "gateway"
  | "docs"

/** Canonical runtime order. CLI order does not override this. */
export const RUNTIME_NAMES = [
  "lib",
  "app",
  "server",
  "client",
  "integration",
  "gateway",
  "docs",
] satisfies readonly RuntimeName[]

/** Fixed directory for each runtime, relative to the project root. */
export const RUNTIME_PATHS = {
  lib: "lib",
  app: "app",
  server: "server",
  client: "client",
  integration: "integration",
  gateway: "gateway",
  docs: "docs",
} satisfies Record<RuntimeName, string>

export function isRuntimeName(value: string): value is RuntimeName {
  for (const name of RUNTIME_NAMES) {
    if (name === value) return true
  }
  return false
}

export function runtimePath(runtime: RuntimeName): string {
  return RUNTIME_PATHS[runtime]
}

/**
 * Runtime-owned contributions for the fixed directory of that runtime.
 * Toolchain output that spans runtimes belongs to the owning preset.
 */
const runtimeProducers: Record<RuntimeName, ProduceContributions> = {
  lib: libContributions,
  app: () => [],
  server: serverContributions,
  client: clientContributions,
  integration: integrationContributions,
  gateway: () => [],
  docs: () => [],
}

const LIB_INDEX = `export function greeting(name: string): string {
  return \`Hello, \${name}\`
}
`

const SERVER_INDEX = `import { createServer } from "node:http"
import { greeting } from "#lib/index"

const server = createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404)
    response.end()
    return
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
  response.end(\`\${greeting("baseline")}\\n\`)
})

server.listen(listenPort(process.env.PORT), "127.0.0.1", () => {
  const address = server.address()
  if (address === null || typeof address === "string") {
    console.error("server did not bind to a port")
    process.exit(1)
  }
  console.log("ready http://127.0.0.1:" + String(address.port))
})

function listenPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 3000
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 3000
  return port
}
`

const SERVER_CONTAINER_INDEX = `import { createServer } from "node:http"
import { greeting } from "#lib/index"

const server = createServer((request, response) => {
  const path = requestPath(request.url)
  if (path === "/healthcheck") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
    response.end("ok\\n")
    return
  }
  if (path === "/api") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
    response.end(\`\${greeting("baseline")}\\n\`)
    return
  }
  if (path !== "/") {
    response.writeHead(404)
    response.end()
    return
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
  response.end(\`\${greeting("baseline")}\\n\`)
})

server.listen(listenPort(process.env.PORT), "0.0.0.0", () => {
  const address = server.address()
  if (address === null || typeof address === "string") {
    console.error("server did not bind to a port")
    process.exit(1)
  }
  console.log("ready http://127.0.0.1:" + String(address.port))
})

function requestPath(url: string | undefined): string {
  if (url === undefined || url.length === 0) return "/"
  const path = url.split("?")[0]
  if (path === undefined || path.length === 0) return "/"
  return path
}

function listenPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 3000
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 3000
  return port
}
`

const SERVER_GRAPHQL_INDEX = (
  container: boolean
) => `import { initServer } from "#server/initServer"

const HOST = ${JSON.stringify(container ? "0.0.0.0" : "127.0.0.1")}
const PORT = listenPort(process.env.PORT)

void initServer()
  .then(({ express: app }) => {
    const server = app.listen(PORT, HOST)
    server.on("listening", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        console.error("server did not bind to a port")
        process.exit(1)
      }
      console.log("ready http://127.0.0.1:" + String(address.port))
    })
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

function listenPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 7001
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 7001
  return port
}
`

function libContributions(
  _selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  if (facts.hasPublishedLibFile) return []
  return [
    {
      id: "runtime:lib:index",
      source: "runtime:lib",
      kind: "starter-file",
      path: "lib/index.ts",
      contents: LIB_INDEX,
    },
  ]
}

const CLIENT_INDEX = `export {}\n`

function integrationContributions(
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const identity = containerIdentity(facts.root.name)
  return [
    {
      id: "runtime:integration:service-url",
      source: "runtime:integration",
      kind: "line",
      path: ".env.example",
      value: `${identity.serviceUrlName}='${identity.serviceUrl}'`,
    },
    ...(!facts.hasApplicationIntegrationTest
      ? [
          {
            id: "runtime:integration:service-test",
            source: "runtime:integration",
            kind: "starter-file",
            path: "integration/service.test.ts",
            contents: selection.presets.includes("graphql")
              ? graphqlIntegrationTest(identity.serviceUrlName)
              : integrationTest(identity.serviceUrlName),
          } satisfies Contribution,
        ]
      : []),
  ]
}

function integrationTest(urlName: string): string {
  return `import { expect, test } from "vitest"

test("reaches the service", async () => {
  const response = await fetch(\`\${process.env.${urlName}}/api\`)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("Hello, baseline")
})
`
}

function graphqlIntegrationTest(urlName: string): string {
  return `import { expect, test } from "vitest"

test("reaches the service GraphQL API", async () => {
  const url = new URL("/api", process.env.${urlName})
  url.searchParams.set("query", '{ greeting(name: "baseline") }')
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("Hello, baseline")
})
`
}

function clientContributions(selection: Selection): readonly Contribution[] {
  if (selection.presets.includes("graphql")) return []
  return [
    {
      id: "runtime:client:index",
      source: "runtime:client",
      kind: "starter-file",
      path: "client/index.ts",
      contents: CLIENT_INDEX,
    },
  ]
}

function serverContributions(
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  return [
    {
      id: "runtime:server:index",
      source: "runtime:server",
      kind: "starter-file",
      path: "server/index.ts",
      contents:
        selection.presets.includes("graphql") &&
        facts.hasApplicationServerInitServer !== true
          ? SERVER_GRAPHQL_INDEX(selection.presets.includes("docker"))
          : selection.presets.includes("docker")
          ? SERVER_CONTAINER_INDEX
          : SERVER_INDEX,
    },
    {
      id: "runtime:server:start",
      source: "runtime:server",
      kind: "package-script",
      manifest: "package.json",
      name: "start",
      command: "node dist/server/index.js",
    },
  ]
}

export function runtimeContributions(
  runtime: RuntimeName,
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const produce = runtimeProducers[runtime]
  if (produce === undefined) {
    throw new Error(`Missing runtime producer for ${runtime}`)
  }
  return produce(selection, facts)
}
