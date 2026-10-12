import type {
  Contribution,
  ProduceContributions,
  ViteConfigItem,
} from "../contributions.js"
import type { ProjectFacts } from "../facts.js"

/** Vite owns the standalone build config for each selected runtime. */
export const contributions: ProduceContributions = (selection, facts) => {
  const produced: Contribution[] = [dependency("vite", "8.3.4")]
  if (selection.runtimes.includes("lib")) {
    produced.push(
      script("build:lib", "vite build --config vite.lib.config.ts"),
      libConfig(facts)
    )
  }
  if (selection.runtimes.includes("server")) {
    produced.push(
      script("build:server", "vite build --config vite.server.config.ts"),
      serverConfig()
    )
  }
  return produced
}

function libConfig(facts: ProjectFacts): Contribution {
  return viteConfig("vite.lib.config.ts", [
    resolveImport(),
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
