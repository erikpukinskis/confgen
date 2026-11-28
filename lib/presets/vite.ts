import type {
  Contribution,
  ProduceContributions,
  ViteConfigItem,
} from "../contributions"
import type { ProjectFacts } from "../facts"
import { clientPackageName } from "../packageManifest"
import type { Selection } from "../selection"

/** Vite owns the standalone build config for each selected runtime. */
export const contributions: ProduceContributions = (selection, facts) => {
  const produced: Contribution[] = [dependency("vite", "8.3.4")]
  if (
    selection.runtimes.includes("lib") ||
    selection.runtimes.includes("client")
  ) {
    produced.push(dependency("unplugin-dts", "1.1.2"))
    if (
      !facts.root.dependencies.includes("unplugin-dts") ||
      facts.root.dependencies.includes("@microsoft/api-extractor")
    ) {
      produced.push(dependency("@microsoft/api-extractor", "7.59.4"))
    }
  }
  if (selection.runtimes.includes("lib")) {
    produced.push(
      script("build:lib", "vite build --config vite.lib.config.ts"),
      libConfig(selection, facts),
    )
  }
  if (selection.runtimes.includes("server")) {
    produced.push(
      dependency("vite-node", "6.0.0"),
      script("build:server", "vite build --config vite.server.config.ts"),
      serverConfig(),
    )
  }
  if (selection.runtimes.includes("client")) {
    produced.push(
      script("build:client", "vite build --config vite.client.config.ts"),
      clientConfig(selection, facts),
    )
  }
  return produced
}

function libConfig(selection: Selection, facts: ProjectFacts): Contribution {
  const platform = selection.libraryPlatform
  if (platform === undefined) {
    throw new Error("lib runtime is missing a library platform")
  }
  const testKit = selection.libraryTestKit === true
  const node = platform === "node"
  const items: ViteConfigItem[] = [
    resolveImport(),
    ...dtsPlugin(testKit ? TEST_KIT_DTS : LIB_DTS),
  ]
  if (node) {
    items.push(property("build-ssr", ["build", "ssr"], "true"))
  }
  items.push(
    property(
      "build-lib-entry",
      ["build", "lib", "entry"],
      testKit ? MULTI_ENTRY : 'resolve("lib/index.ts")',
    ),
    property(
      "build-lib-name",
      ["build", "lib", "name"],
      JSON.stringify(facts.root.name),
    ),
    property("build-lib-formats", ["build", "lib", "formats"], '["es"]'),
    property(
      "build-lib-file",
      ["build", "lib", "fileName"],
      testKit ? "(_format, entryName) => `${entryName}.js`" : '"index"',
    ),
    property("build-out", ["build", "outDir"], '"dist/lib"'),
    property("build-empty", ["build", "emptyOutDir"], "true"),
    property("build-minify", ["build", "minify"], "false"),
    property(
      "build-target",
      ["build", "target"],
      node ? '"node24"' : '"es2024"',
    ),
  )
  if (node) {
    items.push(
      property(
        "build-entry-file",
        ["build", "rolldownOptions", "output", "entryFileNames"],
        testKit ? '"[name].js"' : '"index.js"',
      ),
    )
  }
  return viteConfig("vite.lib.config.ts", items)
}

const LIB_DTS = `{
  tsconfigPath: resolve("tsconfig.json"),
  bundleTypes: true,
  include: ["lib/**/*.ts"],
  exclude: ["**/*.test.ts", "lib/test-kit.ts"],
}`

const TEST_KIT_DTS = `{
  tsconfigPath: resolve("tsconfig.json"),
  bundleTypes: true,
  include: ["lib/**/*.ts", "gql/**/*.ts", "server/**/*.ts"],
  exclude: ["**/*.test.ts", "gql/client/**"],
}`

const MULTI_ENTRY = `{
  index: resolve("lib/index.ts"),
  "test-kit": resolve("lib/test-kit.ts"),
}`

function serverConfig(): Contribution {
  return viteConfig("vite.server.config.ts", [
    resolveImport(),
    property("app-type", ["appType"], '"custom"'),
    property("public-dir", ["publicDir"], "false"),
    property("build-ssr", ["build", "ssr"], 'resolve("server/index.ts")'),
    property("build-out", ["build", "outDir"], '"dist/server"'),
    property("build-empty", ["build", "emptyOutDir"], "true"),
    property("build-minify", ["build", "minify"], "false"),
    property("build-target", ["build", "target"], '"node24"'),
    property(
      "build-format",
      ["build", "rolldownOptions", "output", "format"],
      '"es"',
    ),
    property(
      "build-entry-file",
      ["build", "rolldownOptions", "output", "entryFileNames"],
      '"index.mjs"',
    ),
  ])
}

function clientConfig(selection: Selection, facts: ProjectFacts): Contribution {
  const items: ViteConfigItem[] = [
    resolveImport(),
    ...dtsPlugin(`{
      tsconfigPath: resolve("tsconfig.client.json"),
    }`),
    property(
      "build-lib-entry",
      ["build", "lib", "entry"],
      'resolve("client/index.ts")',
    ),
    property(
      "build-lib-name",
      ["build", "lib", "name"],
      JSON.stringify(clientPackageName(facts.root.name)),
    ),
    property("build-lib-formats", ["build", "lib", "formats"], '["es"]'),
    property("build-lib-file", ["build", "lib", "fileName"], '"index"'),
    property("build-out", ["build", "outDir"], '"client/dist"'),
    property("build-empty", ["build", "emptyOutDir"], "true"),
    property("build-minify", ["build", "minify"], "false"),
    property("build-target", ["build", "target"], '"node24"'),
  ]
  if (selection.presets.includes("graphql")) {
    items.push(
      property(
        "graphql-client-alias",
        ["resolve", "alias"],
        `[
      { find: "#gql/client", replacement: resolve("gql/client/index.ts") },
    ]`,
      ),
      property(
        "build-external",
        ["build", "rolldownOptions", "external"],
        '["graphql", "@graphql-typed-document-node/core"]',
      ),
    )
  }
  return viteConfig("vite.client.config.ts", items)
}

function viteConfig(
  path: string,
  items: readonly ViteConfigItem[],
): Contribution {
  return {
    id: `vite:config:${path}`,
    source: "preset:vite",
    kind: "vite-config",
    path,
    items,
  }
}

function resolveImport(): ViteConfigItem {
  return {
    id: "import:node:path:resolve",
    source: "preset:vite",
    kind: "import",
    module: "node:path",
    imported: { kind: "named", name: "resolve" },
    preferredLocal: "resolve",
  }
}

function dtsPlugin(options: string): ViteConfigItem[] {
  return [
    {
      id: "import:unplugin-dts",
      source: "preset:vite",
      kind: "import",
      module: "unplugin-dts/vite",
      imported: { kind: "default" },
      preferredLocal: "dts",
    },
    {
      id: "plugin:dts",
      source: "preset:vite",
      kind: "plugin",
      importId: "import:unplugin-dts",
      arguments: [options],
    },
  ]
}

function property(
  id: string,
  path: readonly string[],
  value: string,
): ViteConfigItem {
  return {
    id: `property:${id}`,
    source: "preset:vite",
    kind: "property",
    path,
    value,
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `vite:dependency:${name}`,
    source: "preset:vite",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `vite:script:${name}`,
    source: "preset:vite",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
