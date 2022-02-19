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

const generatedCommands = []

for (const presetName of presetNames) {
  console.log(`Generating config for preset [${presetName}]...`)
  const generated = presets[presetName](presetNames, argsByPresetName)

  generatedCommands.push(...generated)
}

const packageCommands = generatedCommands.filter(
  ({ command, dev }) => command === "yarn" && !dev
)

const devPackageCommands = generatedCommands.filter(
  ({ command, dev }) => command === "yarn" && dev
)

const otherCommands = generatedCommands.filter(
  ({ command }) => command !== "yarn"
)

const packages = packageCommands.map(({ pkg }) => pkg).join(" ")
execSync(`yarn add ${packages}`, { stdio: "inherit" })

const devPackages = devPackageCommands.map(({ pkg }) => pkg).join(" ")
execSync(`yarn add -D ${packages}`, { stdio: "inherit" })

for (const { command, ...args } of otherCommands) {
  commands[command as Command](args)
}

