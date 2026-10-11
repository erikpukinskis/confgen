export type PresetName =
  | "yarn"
  | "typescript"
  | "vite"
  | "vitest"
  | "eslint"
  | "prettier"
  | "react"
  | "graphql"
  | "docker"
  | "httpd"
  | "sql"
  | "codedocs"
  | "git"
  | "githubActions"
  | "githubPackage"

/** Canonical preset order. CLI order does not override this. */
export const PRESET_NAMES = [
  "yarn",
  "typescript",
  "vite",
  "vitest",
  "eslint",
  "prettier",
  "react",
  "graphql",
  "docker",
  "httpd",
  "sql",
  "codedocs",
  "git",
  "githubActions",
  "githubPackage",
] satisfies readonly PresetName[]

export function isPresetName(value: string): value is PresetName {
  for (const name of PRESET_NAMES) {
    if (name === value) return true
  }
  return false
}
