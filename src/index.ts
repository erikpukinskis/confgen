import { presets } from "./presets"
import {
  PRESETS,
  Preset,
  isPackageCommand,
  isDevPackageCommand,
  PackageCommand,
  DevPackageCommand,
} from "./types"
import { runCommand } from "./commands"

const [, , ...args] = process.argv

// Eslint makes things better, and Prettier makes things pretty so we want
// prettier to be last and eslint to be second-to-last
if (args.includes("eslint")) {
  const index = args.indexOf("eslint")
  args.splice(index, 1)
  args.push("eslint")
}
if (args.includes("prettier")) {
  const index = args.indexOf("prettier")
  args.splice(index, 1)
  args.push("prettier")
}

const argsByPresetName = {} as Record<Preset, string[]>

const presetNames = args.map((arg) => {
  const [presetName, ...presetArgs] = arg.split(":") as [Preset, ...string[]]
  if (!PRESETS.includes(presetName)) {
    throw new Error(
      `${presetName} is not a valid preset.\n\nUsage:\nnpx confgen [${PRESETS.join(
        " | "
      )}]\n`
    )
  }
  argsByPresetName[presetName] = presetArgs
  return presetName
})

const generatedCommands = []

for (const presetName of presetNames) {
  console.log(`Generating commands for preset [${presetName}]...`)
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
