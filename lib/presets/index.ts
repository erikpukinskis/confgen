import * as all from "./all"
import * as bin from "./bin"
import * as codegen from "./codegen"
import * as codespaces from "./codespaces"
import * as dist from "./dist"
import * as macros from "./macros"
import * as eslint from "./eslint"
import * as git from "./git"
import * as githubPackage from "./githubPackage"
import * as node from "./node"
import * as prettier from "./prettier"
import * as react from "./react"
import * as sql from "./sql"
import * as start from "./start"
import * as templates from "./templates"
import * as typescript from "./typescript"
import * as vite from "./vite"
import * as vitest from "./vitest"
import * as yarn from "./yarn"

import type { PresetName } from "./types"
import type { Precheck } from "@/commands"
import type { Args } from "@/args"
import type { System } from "@/system"
import type { Runtime } from "@/runtimes"

const PRESETS = {
  all,
  bin,
  codegen,
  codespaces,
  dist,
  eslint,
  git,
  githubPackage,
  macros,
  node,
  prettier,
  react,
  sql,
  start,
  templates,
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
  runtimes: Runtime[],
  presets: PresetName[],
  args: Args,
  system: System
) => {
  const preset = PRESETS[name]
  if (!hasPrecheck(preset)) return
  preset.precheck({ runtimes, presets, args, system })
}

export const generate = (
  name: PresetName,
  runtimes: Runtime[],
  presets: PresetName[],
  args: Args,
  system: System
) => {
  const preset = PRESETS[name]
  return preset.generator({ runtimes, presets, args, system })
}

export * from "./types"
