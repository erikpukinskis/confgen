import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"

/** Prettier owns formatting configuration. */
export const contributions: ProduceContributions = () => [
  dependency("prettier", "2.8.1"),
  script("check:format", "prettier --check ."),
  script("fix:format", "prettier --write ."),
  setting("prettier:semi", ["semi"], false),
  setting("prettier:tab-width", ["tabWidth"], 2),
  setting("prettier:quote-props", ["quoteProps"], "preserve"),
  ...IGNORE_LINES.map(
    ([id, value]): Contribution => ({
      id: `prettier:ignore:${id}`,
      source: "preset:prettier",
      kind: "line",
      path: ".prettierignore",
      value,
    })
  ),
]

const IGNORE_LINES: readonly (readonly [string, string])[] = [
  ["dist", "dist"],
  ["yarn-dir", ".yarn"],
  ["pnp", ".pnp.cjs"],
  ["pnp-loader", ".pnp.loader.mjs"],
  ["coverage", "coverage"],
  ["yarn-lock", "yarn.lock"],
  ["nvmrc", ".nvmrc"],
]

function setting(
  id: string,
  address: StructuredAddress,
  value: JsonValue
): Contribution {
  return {
    id,
    source: "preset:prettier",
    kind: "structured",
    path: ".prettierrc.json",
    format: "json",
    address,
    value,
    update: "replace",
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `prettier:dependency:${name}`,
    source: "preset:prettier",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `prettier:script:${name}`,
    source: "preset:prettier",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
