import { collectContributions, type Contribution } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
import { reconcile } from "./reconcile.js"
import { parseSelection } from "./selection.js"
import { expect, test } from "vitest"

const root = {
  path: "package.json",
  name: "@example/package-service",
  version: "0.1.0",
  repository: {
    type: "git",
    url: "https://github.com/example/package-service.git",
  },
  workspaces: [],
  registry: "https://npm.example.test",
}
const facts: ProjectFacts = { root, packages: [root] }

const selection = parseSelection([
  "runtimes=#lib,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "vitest",
  "eslint",
  "prettier",
  "git",
  "graphql",
])

test("the package selection publishes a root and client workspace", () => {
  const contributions = collectContributions(selection, facts)
  expect(byId(contributions, "package-manifest:build")).toMatchObject({
    command:
      "rm -rf dist client/dist && yarn build:generate && yarn build:lib && yarn build:test-kit && yarn build:server && yarn build:client",
  })
  expect(byId(contributions, "package-manifest:check")).toMatchObject({
    command: "yarn check:types && yarn check:lint && yarn check:format",
  })
  expect(byId(contributions, "package-manifest:workspaces")).toMatchObject({
    value: ["client"],
  })
  expect(byId(contributions, "package-manifest:client:name")).toMatchObject({
    path: "client/package.json",
    value: "@example/package-service-client",
  })
  expect(byId(contributions, "package-manifest:client:version")).toMatchObject({
    value: "0.1.0",
  })
  expect(byId(contributions, "package-manifest:client:registry")).toMatchObject(
    {
      value: "https://npm.example.test",
    }
  )
  expect(byId(contributions, "graphql:script:build:generate")).toMatchObject({
    command: "graphql-codegen",
  })
  const clientImports = contributions.filter(
    (contribution) =>
      contribution.kind === "structured" &&
      contribution.path === "client/package.json" &&
      contribution.address[0] === "imports"
  )
  expect(clientImports).toEqual([])

  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "@example/package-service", "version": "0.1.0" }\n',
      ],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const files = writtenFiles(created.files)
  const codegen = files.get("codegen.yml")
  expect(codegen).toContain("gql/_generated/resolvers.ts")
  expect(codegen).toContain("preset: client")
  expect(codegen?.match(/preset: client/g)).toEqual(["preset: client"])
  const clientManifest = parseObject(files.get("client/package.json"))
  expect(clientManifest.imports).toBeUndefined()
  expect(clientManifest.type).toBe("module")
  const clientTsconfig = parseObject(files.get("tsconfig.client.json"))
  expect(clientTsconfig.compilerOptions).toMatchObject({
    moduleResolution: "NodeNext",
  })
  expect(clientTsconfig.include).toEqual([
    "client/**/*.ts",
    "gql/client/**/*.ts",
  ])
  expect(parseObject(files.get("tsconfig.json")).include).not.toContain(
    "client/**/*.ts"
  )
  const libVite = files.get("vite.lib.config.ts")
  expect(libVite).toContain("unplugin-dts/vite")
  expect(libVite).toContain('["es"]')
  expect(libVite).not.toContain('"cjs"')
  expect(libVite).not.toContain('"umd"')
  expect(files.get("vite.client.config.ts")).not.toContain("alias")
  const testKitVite = files.get("vite.test-kit.config.ts")
  expect(testKitVite).toContain('id.startsWith("#")')
  expect(testKitVite).toContain('!id.includes("/node_modules/")')
  expect(testKitVite).not.toContain('["graphql"]')
  expect(files.has("gql/schema.graphql")).toBe(true)
  expect(files.has("gql/_generated/resolvers.ts")).toBe(false)
  const loader = files.get("gql/graphqlRawLoader.mjs")
  expect(loader).toContain('.endsWith(".graphql?raw")')
  expect(loader).toContain('parsed.search === "?raw"')
  expect(loader).not.toContain(".ts?raw")
  expect(files.get("gql/registerGraphqlRaw.mjs")).toContain(
    "./graphqlRawLoader.mjs"
  )

  files.set("yarn.lock", "# lock\n")
  files.set(".pnp.cjs", "// pnp\n")
  const again = reconcile({
    selection,
    contributions,
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(again.files).toEqual([])
  expect(again.runYarnInstall).toBe(false)
})

test("published file lists keep application entries", () => {
  const contributions = collectContributions(selection, facts)
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "@example/package-service", "version": "0.1.0", "files": ["dist", "compose.base.yaml"] }\n',
      ],
      [
        "client/package.json",
        '{ "name": "@example/package-service-client", "files": ["dist", "README.md"] }\n',
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const files = writtenFiles(created.files)
  expect(parseObject(files.get("package.json")).files).toEqual([
    "dist",
    "compose.base.yaml",
  ])
  expect(parseObject(files.get("client/package.json")).files).toEqual([
    "dist",
    "README.md",
  ])
})

test("graphql codegen keeps an existing application file", () => {
  const contributions = collectContributions(selection, facts)
  const current = "schema: gql/schema.graphql\nscalars: Json\n"
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "@example/package-service", "version": "0.1.0" }\n',
      ],
      ["codegen.yml", current],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(created.files.find((change) => change.path === "codegen.yml")).toBe(
    undefined
  )
})

test("graphql without a client workspace stays one server pipeline", () => {
  const serverSelection = parseSelection([
    "runtimes=#lib,#server",
    "yarn",
    "typescript",
    "vite",
    "graphql",
  ])
  const contributions = collectContributions(serverSelection, facts)
  expect(contributions.some(mentionsClientPackage)).toBe(false)
  expect(
    contributions.some(
      (contribution) =>
        contribution.kind === "starter-file" &&
        contribution.path === "client/index.ts"
    )
  ).toBe(false)
  const created = reconcile({
    selection: serverSelection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const codegen = writtenFiles(created.files).get("codegen.yml")
  expect(codegen).toContain("typescript-resolvers")
  expect(codegen).not.toContain("preset: client")
})

function byId(
  contributions: readonly Contribution[],
  id: string
): Contribution {
  const found = contributions.find((contribution) => contribution.id === id)
  if (found === undefined) throw new Error(`missing contribution ${id}`)
  return found
}

function writtenFiles(
  changes: ReturnType<typeof reconcile>["files"]
): Map<string, string> {
  const files = new Map<string, string>()
  for (const change of changes) {
    if (change.type === "write") files.set(change.path, change.contents)
  }
  return files
}

function parseObject(text: string | undefined): Record<string, unknown> {
  if (text === undefined) throw new Error("missing file")
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) throw new Error("expected an object")
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mentionsClientPackage(contribution: Contribution): boolean {
  switch (contribution.kind) {
    case "dependency":
    case "package-script":
      return contribution.manifest === "client/package.json"
    case "whole-file":
    case "starter-file":
    case "structured":
    case "line":
    case "vite-config":
      return contribution.path === "client/package.json"
    default:
      return unexpected(contribution)
  }
}

function unexpected(value: never): never {
  throw new Error(`Unexpected contribution ${JSON.stringify(value)}`)
}
