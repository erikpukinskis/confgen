import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions"
import type { ProjectFacts } from "../facts"
import type { Selection } from "../selection"
import { NODE_VERSION, YARN_VERSION } from "../toolchain"

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
      contents: `${NODE_VERSION}\n`,
    },
    json("yarn:package-manager", ["packageManager"], `yarn@${YARN_VERSION}`),
    ...(facts.root.type === "module"
      ? [json("yarn:module-type", ["type"], "module")]
      : []),
    json("yarn:engines-node", ["engines", "node"], NODE_VERSION),
    json("yarn:engines-yarn", ["engines", "yarn"], YARN_VERSION),
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
