import type { Contribution, JsonValue } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
import { containerIdentity } from "./presets/docker.js"
import type { RuntimeName } from "./runtimes.js"
import type { Selection } from "./selection.js"

/**
 * Package-manifest owner for workspaces, exports, dependency publication
 * metadata, and lifecycle scripts. Aggregate commands are chosen from the
 * complete selection here so preset order cannot change them. Contributions
 * are recorded as `preset:yarn` because they live in the Yarn-managed
 * package manifests.
 */
export function packageManifestContributions(
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const produced: Contribution[] = [
  ]
  const build = aggregateBuild(selection, facts)
  if (build !== undefined) produced.push(script("build", build))
  const fix = aggregateFix(selection)
  if (fix !== undefined) produced.push(script("fix", fix))
  const check = aggregateCheck(selection)
  if (check !== undefined) produced.push(script("check", check))

  if (
    selection.presets.includes("vite") &&
    selection.runtimes.includes("lib")
  ) {
    produced.push(
      json("files", ["files"], ["dist"], "merge"),
      json("exports", ["exports"], rootExports(selection))
    )
  }
  if (selection.runtimes.includes("client")) {
    produced.push(
      json("workspaces", ["workspaces"], ["client"]),
      ...clientManifest(facts)
    )
  }
  if (publishable(selection)) {
    produced.push(
      dependency("yalc", "1.0.0-pre.53"),
      script("inspect:pack", inspectCommand(selection, facts)),
      script("yalc:publish", yalcPublishCommand(selection))
    )
  }
  produced.push(...integrationScripts(selection, facts))
  return produced
}

/** Client workspace package name derived from the root package name. */
export function clientPackageName(rootName: string): string {
  return `${rootName}-client`
}

const BUILD_SCRIPTS: Partial<Record<RuntimeName, string>> = {
  lib: "build:lib",
  server: "build:server",
  client: "build:client",
}

function aggregateBuild(
  selection: Selection,
  facts: ProjectFacts
): string | undefined {
  const commands: string[] = []
  const clean = cleanOutput(selection)
  if (clean.length > 0) commands.push(`rm -rf ${clean.join(" ")}`)
  if (selection.presets.includes("graphql"))
    commands.push("yarn build:generate")
  if (selection.presets.includes("vite")) {
    for (const runtime of selection.runtimes) {
      const name = BUILD_SCRIPTS[runtime]
      if (name !== undefined) commands.push(`yarn ${name}`)
      if (
        runtime === "lib" &&
        selection.presets.includes("graphql") &&
        selection.runtimes.includes("lib") &&
        facts.root.dependencies.includes("graphql-dev-kit")
      ) {
        commands.push("yarn build:test-kit")
      }
    }
  }
  if (commands.length === 0) return undefined
  return commands.join(" && ")
}

function cleanOutput(selection: Selection): string[] {
  if (!selection.presets.includes("vite")) return []
  const paths: string[] = []
  if (
    selection.runtimes.includes("lib") ||
    selection.runtimes.includes("server") ||
    selection.runtimes.includes("client")
  ) {
    paths.push("dist")
  }
  if (selection.runtimes.includes("client")) paths.push("client/dist")
  return paths
}

function aggregateFix(selection: Selection): string | undefined {
  const commands: string[] = []
  if (selection.presets.includes("eslint")) commands.push("yarn fix:lint")
  if (selection.presets.includes("prettier")) commands.push("yarn fix:format")
  if (commands.length === 0) return undefined
  return commands.join(" && ")
}

function aggregateCheck(selection: Selection): string | undefined {
  const commands: string[] = []
  if (selection.presets.includes("typescript"))
    commands.push("yarn check:types")
  if (selection.presets.includes("eslint")) commands.push("yarn check:lint")
  if (selection.presets.includes("prettier")) commands.push("yarn check:format")
  if (commands.length === 0) return undefined
  return commands.join(" && ")
}

function rootExports(selection: Selection): JsonValue {
  const value: { [key: string]: JsonValue } = {
    ".": {
      import: {
        types: "./dist/lib/index.d.ts",
        default: "./dist/lib/index.js",
      },
    },
  }
  if (selection.presets.includes("graphql")) {
    value["./test"] = {
      import: {
        types: "./dist/test/index.d.ts",
        default: "./dist/test/index.js",
      },
    }
  }
  return value
}

function clientManifest(facts: ProjectFacts): Contribution[] {
  const name = clientPackageName(facts.root.name)
  const produced: Contribution[] = [
    clientJson("name", ["name"], name),
    clientJson("type", ["type"], "module"),
    clientJson("files", ["files"], ["dist"], "merge"),
    clientJson("exports", ["exports"], {
      ".": {
        import: {
          types: "./dist/client/index.d.ts",
          default: "./dist/index.js",
        },
      },
    }),
    clientJson("engines", ["engines", "node"], "^24.0.0"),
  ]
  if (facts.root.version !== undefined) {
    produced.push(clientJson("version", ["version"], facts.root.version))
  }
  if (facts.root.repository !== undefined) {
    produced.push(
      clientJson("repository", ["repository"], {
        type: facts.root.repository.type,
        url: facts.root.repository.url,
      })
    )
  }
  if (facts.root.registry !== undefined) {
    produced.push(
      clientJson("registry", ["publishConfig", "registry"], facts.root.registry)
    )
  }
  return produced
}

function inspectCommand(selection: Selection, facts: ProjectFacts): string {
  const commands: string[] = []
  if (selection.runtimes.includes("lib")) commands.push("yarn pack --dry-run")
  if (selection.runtimes.includes("client")) {
    commands.push(
      `yarn workspace ${clientPackageName(facts.root.name)} pack --dry-run`
    )
  }
  return commands.join(" && ")
}

function yalcPublishCommand(selection: Selection): string {
  const commands: string[] = []
  if (selection.runtimes.includes("lib")) {
    commands.push("yalc publish --store-folder .yalc-store .")
  }
  if (selection.runtimes.includes("client")) {
    commands.push("yalc publish --store-folder .yalc-store client")
  }
  return commands.join(" && ")
}

function integrationScripts(
  selection: Selection,
  facts: ProjectFacts
): Contribution[] {
  if (!selection.runtimes.includes("integration")) return []
  const produced: Contribution[] = []
  if (selection.presets.includes("vitest")) {
    produced.push(
      script(
        "test:integration:run",
        "vitest run --config vite.integration.config.ts"
      )
    )
  }
  if (
    selection.presets.includes("docker") &&
    selection.runtimes.includes("server")
  ) {
    const identity = containerIdentity(facts.root.name)
    const state =
      '"${DEV_CLUSTER_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/dev-cluster}/certs"'
    produced.push(
      script(
        "test:integration:local",
        `dev-cluster up ${identity.integrationServiceName}`
      ),
      script("test:integration:ci", "sh scripts/test-integration-ci.sh"),
      script(
        "shell:integration",
        `SSL_PATH=${state} docker compose -f compose.base.yaml -f compose.local.yaml run --rm -it --entrypoint /bin/bash ${identity.integrationServiceName}`
      )
    )
  }
  return produced
}

function publishable(selection: Selection): boolean {
  return (
    selection.presets.includes("vite") &&
    (selection.runtimes.includes("lib") ||
      selection.runtimes.includes("client"))
  )
}

function script(name: string, command: string): Contribution {
  return {
    id: `package-manifest:${name}`,
    source: "preset:yarn",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}

function json(
  id: string,
  address: readonly (string | number)[],
  value: JsonValue,
  update: "merge" | "replace" = "replace"
): Contribution {
  return {
    id: `package-manifest:${id}`,
    source: "preset:yarn",
    kind: "structured",
    path: "package.json",
    format: "json",
    address,
    value,
    update,
  }
}

function clientJson(
  id: string,
  address: readonly (string | number)[],
  value: JsonValue,
  update: "merge" | "replace" = "replace"
): Contribution {
  return {
    id: `package-manifest:client:${id}`,
    source: "preset:yarn",
    kind: "structured",
    path: "client/package.json",
    format: "json",
    address,
    value,
    update,
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `package-manifest:dependency:${name}`,
    source: "preset:yarn",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}
