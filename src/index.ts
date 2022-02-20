import { presets } from "./presets"
import {
  Preset,
  CommandGenerator,
  Command,
  isPackageCommand,
  isDevPackageCommand,
  PackageCommand,
  DevPackageCommand,
} from "./types"
import { runCommand } from "./commands"
import { execSync } from "child_process"

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
  generated.forEach((command) => (command.preset = presetName))
  generatedCommands.push(...generated)
}

const packageCommands =
  generatedCommands.filter<PackageCommand>(isPackageCommand)

const devPackageCommands =
  generatedCommands.filter<DevPackageCommand>(isDevPackageCommand)

const otherCommands = generatedCommands.filter(
  ({ command }) => command !== "yarn"
)

const packages = packageCommands.map(({ pkg }) => pkg).join(" ")
if (packages) {
  runCommand({ command: "yarn", pkg: packages })
}

const devPackages = devPackageCommands.map(({ pkg }) => pkg).join(" ")
if (devPackages) {
  runCommand({ command: "yarn", pkg: devPackages, dev: true })
}

for (const command of otherCommands) {
  runCommand(command)
}
