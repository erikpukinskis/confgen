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
import { Preset, CommandGenerator, Command } from "./types"
import { commands } from "./commands"

const [, , ...args] = process.argv

const generators: Record<Preset, CommandGenerator> = {
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

const argsByPreset = {} as Record<Preset, string[]>

const presets = args.map((arg) => {
  const [preset, ...presetArgs] = arg.split(":") as [Preset, ...string[]]
  argsByPreset[preset] = presetArgs
  return preset
})

for (const preset of presets) {
  console.log(`Generating config for preset [${preset}]...`)
  const generated = generators[preset](presets, argsByPreset)

  for (const { command, ...args } of generated) {
    commands[command](args)
  }
}
