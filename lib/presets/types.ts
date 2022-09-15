export const PRESET_NAMES = [
  "all",
  "templates",
  "bin",
  "codegen",
  "codespaces",
  "dist",
  "eslint",
  "git",
  "githubPackage",
  "macros",
  "node",
  "prettier",
  "react",
  "sql",
  "start",
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
