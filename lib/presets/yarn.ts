import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"

/** Yarn owns package-manager configuration. */
export const contributions: ProduceContributions = () => [
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
  json("yarn:module-type", ["type"], "module"),
  json("yarn:engines-node", ["engines", "node"], "^24.0.0"),
]

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
