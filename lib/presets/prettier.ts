import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions"

/** Prettier owns formatting configuration. */
export const contributions: ProduceContributions = (selection, facts) => {
  const ignores: (readonly [string, string])[] = [...IGNORE_LINES]
  if (selection.presets.includes("graphql")) {
    ignores.push(["generated-graphql", "gql/**/_generated"])
  }
  const gitignore = facts.gitignore?.split(/\r?\n/) ?? []
  if (selection.presets.includes("git")) {
    gitignore.push(
      "dist",
      ".pnp.*",
      ".yarn/*",
      "coverage",
      ...(selection.runtimes.includes("lib") ||
      selection.runtimes.includes("client")
        ? [".yalc", "yalc.lock"]
        : []),
      ...(selection.presets.includes("graphql") ? ["gql/**/_generated"] : []),
    )
  }
  const needed = ignores.filter(([, value]) => !ignoredByGit(value, gitignore))
  return [
    dependency("prettier", "2.8.1"),
    script("check:format", "prettier --check ."),
    script("fix:format", "prettier --write ."),
    setting("prettier:semi", ["semi"], false),
    setting("prettier:tab-width", ["tabWidth"], 2),
    setting("prettier:quote-props", ["quoteProps"], "preserve"),
    ...(selection.presets.includes("sql")
      ? [
          dependency("prettier-plugin-sql-cst", "0.8.3"),
          setting(
            "prettier:sql-plugin",
            ["plugins"],
            ["prettier-plugin-sql-cst"],
            "merge",
          ),
        ]
      : []),
    ...needed.map(([id, value]): Contribution => ({
      id: `prettier:ignore:${id}`,
      source: "preset:prettier",
      kind: "line",
      path: ".prettierignore",
      value,
    })),
  ]
}

const IGNORE_LINES: readonly (readonly [string, string])[] = [
  ["dist", "dist"],
  ["yarn-dir", ".yarn"],
  ["pnp", ".pnp.cjs"],
  ["pnp-loader", ".pnp.loader.mjs"],
  ["coverage", "coverage"],
  ["yarn-lock", "yarn.lock"],
  ["nvmrc", ".nvmrc"],
  ["yalc", ".yalc"],
  ["yalc-lock", "yalc.lock"],
]

function ignoredByGit(path: string, lines: readonly string[]): boolean {
  return lines.some((line) => {
    const pattern = line.trim().replace(/\/$/, "")
    if (
      pattern.length === 0 ||
      pattern.startsWith("#") ||
      pattern.startsWith("!")
    )
      return false
    if (pattern === path) return true
    if (pattern === ".pnp.*" && path.startsWith(".pnp.")) return true
    if (pattern === ".yarn/*" && path === ".yarn") return true
    return false
  })
}

function setting(
  id: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace" = "replace",
): Contribution {
  return {
    id,
    source: "preset:prettier",
    kind: "structured",
    path: ".prettierrc.json",
    format: "json",
    address,
    value,
    update,
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
