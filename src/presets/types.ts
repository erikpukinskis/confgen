export const PRESET_NAMES = [
  "all",
  "api",
  "appBuild",
  "bin",
  "codegen",
  "codespaces",
  "devServer",
  "eslint",
  "git",
  "githubPackage",
  "library",
  "macros",
  "node",
  "prettier",
  "react",
  "sql",
  "typescript",
  "vite",
  "vitest",
  "yarn",
] as const

export type PresetName = typeof PRESET_NAMES[number]

export const isPresetName = (name: string): name is PresetName => {
  return PRESET_NAMES.includes(name as PresetName)
}

export type Presets = readonly PresetName[]
