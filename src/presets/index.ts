import { all } from "./all"
import { api } from "./api"
import { appBuild } from "./appBuild"
import { bin } from "./bin"
import { codegen } from "./codegen"
import { codespaces } from "./codespaces"
import { devServer } from "./devServer"
import { macros } from "./macros"
import { eslint } from "./eslint"
import { git } from "./git"
import { library } from "./library"
import { node } from "./node"
import { prettier } from "./prettier"
import { react } from "./react"
import { sql } from "./sql"
import { typescript } from "./typescript"
import { vite } from "./vite"
import { vitest } from "./vitest"
import { yarn } from "./yarn"
import type { PresetName } from "./types"
import type { CommandGenerator } from "@/commands"

type CommandGeneratorsByPreset = {
  readonly [index in PresetName]: CommandGenerator
}

export const presets: CommandGeneratorsByPreset = {
  all,
  api,
  appBuild,
  bin,
  codegen,
  codespaces,
  devServer,
  eslint,
  git,
  library,
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

export * from "./types"
