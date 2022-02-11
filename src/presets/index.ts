import { apollo } from "./apollo"
import { api } from "./api"
import { base } from "./base"
import { bin } from "./bin"
import { bump } from "./bump"
import { devServer } from "./devServer"
import { emotion } from "./emotion"
import { eslint } from "./eslint"
import { library } from "./library"
import { node } from "./node"
import { prettier } from "./prettier"
import { react } from "./react"
import { typescript } from "./typescript"
import { vite } from "./vite"
import { vitest } from "./vitest"
import { yarn } from "./yarn"
import { CommandGenerator } from '@/types'

export const presets: Record<Preset, CommandGenerator> = {
  api,
  apollo,
  bin,
  devServer,
  base,
  bump,
  emotion,
  eslint,
  library,
  node,
  prettier,
  react,
  typescript,
  vite,
  vitest,
  yarn,
}
