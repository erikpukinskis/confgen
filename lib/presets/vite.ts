import type {
  Contribution,
  ProduceContributions,
  ViteConfigItem,
} from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import { clientPackageName } from "../packageManifest.js"
import type { Selection } from "../selection.js"

/** Vite owns the standalone build config for each selected runtime. */
export const contributions: ProduceContributions = (selection, facts) => {
  const produced: Contribution[] = [dependency("vite", "8.3.4")]
  if (
    selection.runtimes.includes("lib") ||
    selection.runtimes.includes("client")
  ) {
    produced.push(
      dependency("unplugin-dts", "1.1.2"),
      dependency("@microsoft/api-extractor", "7.59.4")
    )
  }
  if (selection.runtimes.includes("lib")) {
    produced.push(
      script("build:lib", "vite build --config vite.lib.config.ts"),
      libConfig(facts)
    )
    if (selection.presets.includes("graphql")) {
      produced.push(
        script("build:test-kit", "vite build --config vite.test-kit.config.ts"),
        testKitConfig(facts)
      )
    }
  }
  if (selection.runtimes.includes("server")) {
    produced.push(
      script("build:server", "vite build --config vite.server.config.ts"),
      serverConfig()
    )
  }
  if (selection.runtimes.includes("client")) {
    produced.push(
      script("build:client", "vite build --config vite.client.config.ts"),
      clientConfig(selection, facts)
    )
  }
  return produced
}

function libConfig(facts: ProjectFacts): Contribution {
  return viteConfig("vite.lib.config.ts", [
    resolveImport(),
    ...dtsPlugin(`{
      tsconfigPath: resolve("tsconfig.json"),
      bundleTypes: true,
      include: ["lib/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/test.ts"],
    }`),
    property(
      "build-lib-entry",
      ["build", "lib", "entry"],
      'resolve("lib/index.ts")'
    ),
    property(
      "build-lib-name",
      ["build", "lib", "name"],
      JSON.stringify(facts.root.name)
    ),
    property("build-lib-formats", ["build", "lib", "formats"], '["es"]'),
    property("build-lib-file", ["build", "lib", "fileName"], '"index"'),
    property("build-out", ["build", "outDir"], '"dist/lib"'),
    property("build-empty", ["build", "emptyOutDir"], "true"),
    property("build-minify", ["build", "minify"], "false"),
    property("build-target", ["build", "target"], '"node24"'),
  ])
}

function testKitConfig(facts: ProjectFacts): Contribution {
  return viteConfig("vite.test-kit.config.ts", [
    resolveImport(),
    ...dtsPlugin(`{
      tsconfigPath: resolve("tsconfig.json"),
      bundleTypes: true,
      include: ["lib/test.ts", "gql/**/*.ts"],
      exclude: ["**/*.test.ts", "gql/client/**"],
    }`),
    property(
      "build-lib-entry",
      ["build", "lib", "entry"],
      'resolve("lib/test.ts")'
    ),
    property(
      "build-lib-name",
      ["build", "lib", "name"],
      JSON.stringify(`${facts.root.name}-test`)
    ),
    property("build-lib-formats", ["build", "lib", "formats"], '["es"]'),
    property("build-lib-file", ["build", "lib", "fileName"], '"index"'),
    property("build-out", ["build", "outDir"], '"dist/test"'),
    property("build-empty", ["build", "emptyOutDir"], "true"),
    property("build-minify", ["build", "minify"], "false"),
    property("build-target", ["build", "target"], '"node24"'),
    property(
      "build-external",
      ["build", "rolldownOptions", "external"],
      '["graphql"]'
    ),
  ])
}

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
      '"es"'
    ),
    property(
      "build-entry-file",
      ["build", "rolldownOptions", "output", "entryFileNames"],
      '"index.js"'
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
      'resolve("client/index.ts")'
    ),
    property(
      "build-lib-name",
      ["build", "lib", "name"],
      JSON.stringify(clientPackageName(facts.root.name))
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
        "build-external",
        ["build", "rolldownOptions", "external"],
        '["graphql", "@graphql-typed-document-node/core"]'
      )
    )
  }
  return viteConfig("vite.client.config.ts", items)
}

function viteConfig(
  path: string,
  items: readonly ViteConfigItem[]
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
  value: string
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
