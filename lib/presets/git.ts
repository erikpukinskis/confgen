import type { Contribution, ProduceContributions } from "../contributions.js"

/** Git owns repository exclusions. */
export const contributions: ProduceContributions = () =>
  IGNORE_LINES.map(
    ([id, value]): Contribution => ({
      id: `git:ignore:${id}`,
      source: "preset:git",
      kind: "line",
      path: ".gitignore",
      value,
    })
  )

const IGNORE_LINES: readonly (readonly [string, string])[] = [
  ["01", "yarn-error.log"],
  ["02", "node_modules"],
  ["03", ".DS_Store"],
  ["04", "dist"],
  ["05", ".pnp.*"],
  ["06", ".yarn/*"],
  ["07", "!.yarn/patches"],
  ["08", "!.yarn/plugins"],
  ["09", "!.yarn/releases"],
  ["10", "!.yarn/sdks"],
  ["11", "!.yarn/versions"],
  ["12", "coverage"],
]
