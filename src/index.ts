import { presets } from './presets';
import { Preset, CommandGenerator, Command } from "./types"
import { commands } from "./commands"

const [, , ...args] = process.argv


const argsByPresetName = {} as Record<Preset, string[]>

const presetNames = args.map((arg) => {
  const [presetNames, ...presetArgs] = arg.split(":") as [Preset, ...string[]]
  argsByPresetName[presetNames] = presetArgs
  return presetNames
})

for (const presetName of presetNames) {
  console.log(`Generating config for preset [${presetName}]...`)
  const generated = presets[presetName](presetNames, argsByPresetName)

  for (const { command, ...args } of generated) {
    commands[command as Command](args)
  }
}
