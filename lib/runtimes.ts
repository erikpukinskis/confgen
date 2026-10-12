import type { Contribution, ProduceContributions } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
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
  integration: () => [],
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

function libContributions(): readonly Contribution[] {
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

function serverContributions(): readonly Contribution[] {
  return [
    {
      id: "runtime:server:index",
      source: "runtime:server",
      kind: "starter-file",
      path: "server/index.ts",
      contents: SERVER_INDEX,
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
