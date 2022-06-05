import * as all from "./all"
import * as api from "./api"
import * as bin from "./bin"
import * as build from "./build"
import * as codegen from "./codegen"
import * as codespaces from "./codespaces"
import * as macros from "./macros"
import * as eslint from "./eslint"
import * as git from "./git"
import * as githubPackage from "./githubPackage"
import * as node from "./node"
import * as prettier from "./prettier"
import * as react from "./react"
import * as sql from "./sql"
import * as typescript from "./typescript"
import * as vite from "./vite"
import * as vitest from "./vitest"
import * as yarn from "./yarn"

import type { PresetName, Presets } from "./types"
import type { Precheck } from "@/commands"
import type { Args } from "@/args"
import type { System } from "@/system"

const PRESETS = {
  all,
  api,
  bin,
  build,
  codegen,
  codespaces,
  eslint,
  git,
  githubPackage,
  macros,
  node,
  prettier,
  react,
  sql,
  typescript,
  vite,
  vitest,
  yarn,
} as const

type Preset = typeof PRESETS[PresetName]
type PresetWithPrecheck = Preset & {
  precheck: Precheck
}

const hasPrecheck = (preset: Preset): preset is PresetWithPrecheck => {
  return Object.prototype.hasOwnProperty.call(preset, "precheck")
}

export const precheck = (
  name: PresetName,
  presets: Presets,
  args: Args,
  system: System
) => {
  const preset = PRESETS[name]
  if (!hasPrecheck(preset)) return
  preset.precheck(presets, args, system)
}

export const generate = (
  name: PresetName,
  presets: Presets,
  args: Args,
  system: System
) => {
  const preset = PRESETS[name]
  return preset.generator(presets, args, system)
}

export * from "./types"
