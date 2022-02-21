import { apollo } from "./apollo"
import { api } from "./api"
import { bin } from "./bin"
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
import { Preset, CommandGenerator } from "@/types"

export const presets: Record<Preset, CommandGenerator> = {
  api,
  apollo,
  bin,
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
}
