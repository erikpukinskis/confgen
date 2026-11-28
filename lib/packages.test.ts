import { collectContributions, type Contribution } from "./contributions"
import { ConfgenError } from "./errors"
import type { ProjectFacts } from "./facts"
import { reconcile } from "./reconcile"
import { parseSelection } from "./selection"
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
  dependencies: ["graphql-dev-kit"],
  registry: "https://npm.example.test",
}
const facts: ProjectFacts = { root, packages: [root] }

const selection = parseSelection([
  "runtimes=#lib:node,#server,#client",
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
      "rm -rf dist client/dist && yarn build:generate && yarn build:lib && yarn build:server && yarn build:client",
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
    },
  )
  expect(byId(contributions, "graphql:script:build:generate")).toMatchObject({
    command: "graphql-codegen",
  })
  const clientImports = contributions.filter(
    (contribution) =>
      contribution.kind === "structured" &&
      contribution.path === "client/package.json" &&
      contribution.address[0] === "imports",
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
  const rootManifest = parseObject(files.get("package.json"))
  expect(rootManifest.scripts).toMatchObject({
    bump: "bump-n-pub --bump-only",
  })
  expect(rootManifest.devDependencies).toMatchObject({
    "bump-n-pub": "0.30.0",
  })
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
  expect(clientTsconfig.compilerOptions).toMatchObject({
    paths: { "#gql/client": ["./gql/client/index.ts"] },
  })
  expect(files.get("client/index.ts")).toContain('from "#gql/client"')
  expect(parseObject(files.get("tsconfig.json")).include).not.toContain(
    "client/**/*.ts",
  )
  const libVite = files.get("vite.lib.config.ts")
  expect(libVite).toContain("unplugin-dts/vite")
  expect(libVite).toContain('["es"]')
  expect(libVite).toContain("ssr: true")
  expect(libVite).toContain('target: "node24"')
  expect(libVite).toContain('entry: resolve("lib/index.ts")')
  expect(libVite).not.toContain('resolve("lib/test-kit.ts")')
  expect(libVite).not.toContain("builtinModules")
  expect(libVite).not.toContain("peerDependencies")
  expect(libVite).not.toContain('"cjs"')
  expect(libVite).not.toContain('"umd"')
  expect(files.has("vite.test-kit.config.ts")).toBe(false)
  expect(files.get("vite.client.config.ts")).toContain('find: "#gql/client"')
  expect(files.get("vite.client.config.ts")).toContain(
    'replacement: resolve("gql/client/index.ts")',
  )
  const rootExports = parseObject(files.get("package.json")).exports
  expect(rootExports).toMatchObject({
    ".": {
      import: {
        types: "./dist/lib/index.d.ts",
        default: "./dist/lib/index.js",
      },
    },
  })
  expect(rootExports).not.toHaveProperty("./test-kit")
  expect(rootExports).not.toHaveProperty("./test")
  expect(parseObject(files.get("package.json")).imports).toMatchObject({
    "#lib/*": "./lib/*.ts",
  })
  expect(files.has("gql/schema.graphql")).toBe(true)
  expect(files.has("gql/_generated/resolvers.ts")).toBe(false)
  expect(files.has("gql/graphqlRawLoader.mjs")).toBe(false)
  expect(files.has("gql/registerGraphqlRaw.mjs")).toBe(false)
  expect(files.has("gql/raw-modules.d.ts")).toBe(false)
  expect(parseObject(files.get("tsconfig.json")).compilerOptions).toMatchObject(
    {
      types: ["node", "vite/client"],
    },
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

test("existing manifest dependency ranges become the selected versions", () => {
  const existingRoot = {
    ...root,
    dependencyRanges: {
      dependencies: {},
      devDependencies: {
        vite: "^5.2.0",
        typescript: "5.9.3",
        graphql: "^16.6.0",
      },
      peerDependencies: {},
    },
  }
  const contributions = collectContributions(selection, {
    root: existingRoot,
    packages: [existingRoot],
  })
  expect(byId(contributions, "vite:dependency:vite")).toMatchObject({
    range: "^5.2.0",
  })
  expect(byId(contributions, "typescript:dependency:typescript")).toMatchObject(
    {
      range: "5.9.3",
    },
  )
  expect(
    byId(contributions, "graphql:dependency:package.json:dependencies:graphql"),
  ).toMatchObject({ range: "^16.6.0" })
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
    undefined,
  )
})

test("graphql without a client workspace stays one server pipeline", () => {
  const serverSelection = parseSelection([
    "runtimes=#lib:node,#server",
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
        contribution.path === "client/index.ts",
    ),
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
  const serverFiles = writtenFiles(created.files)
  expect(serverFiles.has("lib/test-kit.ts")).toBe(false)
  expect(serverFiles.get("vite.lib.config.ts")).not.toContain(
    'resolve("lib/test-kit.ts")',
  )
  expect(
    parseObject(serverFiles.get("package.json")).exports,
  ).not.toHaveProperty("./test-kit")
})

test("selecting graphql alone omits ./test-kit", () => {
  const files = reconciledFiles(selection)
  expect(files.has("lib/test-kit.ts")).toBe(false)
  expect(files.get("vite.lib.config.ts")).not.toContain(
    'resolve("lib/test-kit.ts")',
  )
  const exportsField = parseObject(files.get("package.json")).exports
  expect(exportsField).not.toHaveProperty("./test-kit")
  expect(exportsField).not.toHaveProperty("./test")
})

test("an explicit node test kit publishes ./test-kit from lib/test-kit.ts", () => {
  const files = reconciledFiles(
    parseSelection([
      "runtimes=#lib:node:test-kit,#server,#client",
      "yarn",
      "typescript",
      "vite",
      "graphql",
    ]),
    { ...facts, hasLibraryTestEntry: true },
  )
  const libVite = files.get("vite.lib.config.ts")
  expect(libVite).toContain('index: resolve("lib/index.ts")')
  expect(libVite).toContain('"test-kit": resolve("lib/test-kit.ts")')
  expect(libVite).toContain('outDir: "dist/lib"')
  expect(files.has("lib/test-kit.ts")).toBe(false)
  const exportsField = parseObject(files.get("package.json")).exports
  expect(exportsField).toMatchObject({
    "./test-kit": {
      import: {
        types: "./dist/lib/test-kit.d.ts",
        default: "./dist/lib/test-kit.js",
      },
    },
  })
  expect(exportsField).not.toHaveProperty("./test")
})

test("a test kit modifier without lib/test-kit.ts is an error", () => {
  const error = collectError(["runtimes=#lib:node:test-kit", "vite"])
  expect(error.problems).toEqual([
    "lib/test-kit.ts is missing. #lib:node:test-kit publishes that file at ./test-kit.",
  ])
})

test("a node library without a test kit builds only the root entry", () => {
  const nodeSelection = parseSelection([
    "runtimes=#lib:node",
    "typescript",
    "vite",
  ])
  const files = reconciledFiles(nodeSelection)
  const libVite = files.get("vite.lib.config.ts")
  expect(libVite).toContain('resolve("lib/index.ts")')
  expect(libVite).not.toContain('resolve("lib/test-kit.ts")')
  expect(libVite).toContain("ssr: true")
  expect(libVite).toContain('target: "node24"')
  expect(libVite).not.toContain("builtinModules")
  expect(libVite).not.toContain("peerDependencies")
  expect(files.has("vite.test-kit.config.ts")).toBe(false)
  expect(parseObject(files.get("package.json")).exports).toEqual({
    ".": {
      import: {
        types: "./dist/lib/index.d.ts",
        default: "./dist/lib/index.js",
      },
    },
  })
  expect(parseObject(files.get("tsconfig.json")).compilerOptions).toMatchObject(
    {
      lib: ["ES2024"],
      types: ["node", "vite/client"],
    },
  )
})

test("browser and universal libraries bundle package dependencies", () => {
  const browser = reconciledFiles(
    parseSelection(["runtimes=#lib:browser", "typescript", "vite", "vitest"]),
  )
  const universal = reconciledFiles(
    parseSelection(["runtimes=#lib:universal", "typescript", "vite"]),
  )
  for (const files of [browser, universal]) {
    const libVite = files.get("vite.lib.config.ts")
    expect(libVite).toContain('target: "es2024"')
    expect(libVite).not.toContain("readFileSync")
    expect(libVite).not.toContain("peerDependencies")
    expect(libVite).not.toContain("rolldownOptions")
    expect(libVite).not.toContain("ssr:")
    expect(libVite).toContain('resolve("lib/index.ts")')
    expect(libVite).not.toContain('resolve("lib/test-kit.ts")')
    expect(parseObject(files.get("package.json")).imports).toMatchObject({
      "#lib/*": "./lib/*.ts",
    })
  }
  expect(
    parseObject(browser.get("tsconfig.json")).compilerOptions,
  ).toMatchObject({
    lib: ["ES2024", "DOM", "DOM.Iterable"],
    types: ["vite/client"],
  })
  expect(
    parseObject(universal.get("tsconfig.json")).compilerOptions,
  ).toMatchObject({
    lib: ["ES2024", "DOM", "DOM.Iterable"],
    types: ["node", "vite/client"],
  })
  const browserTest = browser.get("vite.test.config.ts")
  expect(browserTest).toContain("lib/**/*.test.ts")
  expect(browserTest).not.toContain("environment:")
})

test("a browser library that shares a server keeps the shared TypeScript types", () => {
  const files = reconciledFiles(
    parseSelection(["runtimes=#lib:browser,#server", "typescript", "vite"]),
  )
  const compilerOptions = parseObject(
    files.get("tsconfig.json"),
  ).compilerOptions
  expect(compilerOptions).toMatchObject({
    types: ["node", "vite/client"],
  })
  if (!isRecord(compilerOptions)) throw new Error("missing compilerOptions")
  expect(compilerOptions.lib).toBeUndefined()
})

test("graphql on a browser library does not add a test kit", () => {
  const files = reconciledFiles(
    parseSelection(["runtimes=#lib:browser,#server", "graphql", "vite"]),
  )
  expect(files.get("vite.lib.config.ts")).not.toContain(
    'resolve("lib/test-kit.ts")',
  )
  expect(parseObject(files.get("package.json")).exports).not.toHaveProperty(
    "./test-kit",
  )
})

function reconciledFiles(
  selection: ReturnType<typeof parseSelection>,
  projectFacts: ProjectFacts = facts,
) {
  const contributions = collectContributions(selection, projectFacts)
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  return writtenFiles(created.files)
}

function collectError(args: readonly string[]): ConfgenError {
  try {
    collectContributions(parseSelection(args), facts)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a Confgen error")
}

function byId(
  contributions: readonly Contribution[],
  id: string,
): Contribution {
  const found = contributions.find((contribution) => contribution.id === id)
  if (found === undefined) throw new Error(`missing contribution ${id}`)
  return found
}

function writtenFiles(
  changes: ReturnType<typeof reconcile>["files"],
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
    case "dockerfile":
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
