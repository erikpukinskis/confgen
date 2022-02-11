import { presets } from './presets';
import { Preset, CommandGenerator, Command } from "./types"
import { commands } from "./commands"

const [, , ...args] = process.argv


const argsByPresetName = {} as Record<Preset, string[]>

const presetNames = args.map((arg) => {
  const [presetNames, ...presetArgs] = arg.split(":") as [Preset, ...string[]]
  argsByPreset[presetNames] = presetArgs
  return presetNames
})

for (const preset of presets) {
  console.log(`Generating config for preset [${preset}]...`)
  const generated = generators[preset](presetsNames, argsByPresetName)

  for (const { command, ...args } of generated) {
    commands[command](args)
  }
}
