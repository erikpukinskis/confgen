import { api } from "./api"
import { base } from "./base"
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
import { Preset, Configgen, Command } from "./types"
import { commands } from "./commands"

const [, , ...args] = process.argv

const scripts: Record<Preset, Configgen> = {
  api,
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
  console.log(`Configgening ${preset}...`)
  const output = scripts[preset](presets, argsByPreset)

  for (const [key, value] of Object.entries(output)) {
    const [command, ...args] = key.split(":") as [Command, ...string[]]
    const functionArgs = [...args, value]
    let argsLog = JSON.stringify(functionArgs)
    argsLog = argsLog.slice(1, argsLog.length - 1)
    argsLog = argsLog.length < 40 ? argsLog : `${argsLog.slice(0, 40)}...`
    console.log(`${command}(${argsLog})...`)
    commands[command](...functionArgs)
  }
}
