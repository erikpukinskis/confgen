import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import type { Selection } from "../selection.js"

/** Yarn owns package-manager configuration. */
export const contributions: ProduceContributions = (
  selection: Selection,
  facts: ProjectFacts
) => {
  const packages = facts.root.dependencies.filter((name) =>
    UNPLUGGED_PACKAGES.has(name)
  )
  return [
    yarnrc("yarn:yarnrc:node-linker", ["nodeLinker"], "pnp"),
    yarnrc("yarn:yarnrc:enable-global-cache", ["enableGlobalCache"], false),
    {
      id: "yarn:nvmrc",
      source: "preset:yarn",
      kind: "whole-file",
      path: ".nvmrc",
      contents: "24\n",
    },
    json("yarn:package-manager", ["packageManager"], "yarn@4.11.0"),
    ...(facts.root.type === "module"
      ? [json("yarn:module-type", ["type"], "module")]
      : []),
    json("yarn:engines-node", ["engines", "node"], "^24.0.0"),
    ...(selection.presets.includes("vscode") ? sdkContributions() : []),
    ...packages.map((name) =>
      json(`yarn:unplugged:${name}`, ["dependenciesMeta", name], {
        unplugged: true,
      })
    ),
  ]
}

const UNPLUGGED_PACKAGES = new Set([
  "@multiplayerdb/package-service",
  "bcrypt",
  "sql.js",
])

function yarnrc(
  id: string,
  address: StructuredAddress,
  value: JsonValue
): Contribution {
  return {
    id,
    source: "preset:yarn",
    kind: "structured",
    path: ".yarnrc.yml",
    format: "yaml",
    address,
    value,
    update: "replace",
  }
}

function json(
  id: string,
  address: StructuredAddress,
  value: JsonValue
): Contribution {
  return {
    id,
    source: "preset:yarn",
    kind: "structured",
    path: "package.json",
    format: "json",
    address,
    value,
    update: "replace",
  }
}

function sdkContributions(): Contribution[] {
  return [
    {
      id: "yarn:dependency:@yarnpkg/sdks",
      source: "preset:yarn",
      kind: "dependency",
      manifest: "package.json",
      section: "devDependencies",
      package: "@yarnpkg/sdks",
      range: "2",
    },
    ...(
      [
        ["install:sdks", "sdks vscode"],
        ["postinstall", "yarn install:sdks"],
      ] satisfies [string, string][]
    ).map(
      ([name, command]): Contribution => ({
        id: `yarn:script:${name}`,
        source: "preset:yarn",
        kind: "package-script",
        manifest: "package.json",
        name,
        command,
      })
    ),
  ]
}
