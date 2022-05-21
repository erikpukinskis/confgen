import { presets } from "./presets"
import {
  Preset,
  DistPackageCommand,
  isDistPackageCommand,
  DevPackageCommand,
  isDevPackageCommand,
  Args,
} from "./types"
import { runCommand } from "./commands"
import { RealSystem, type System } from "./system"

export class Project {
  system: System
  presetNames: Preset[]
  argsByPresetName: Args

  constructor({
    presetNames,
    argsByPresetName,
    system,
  }: Pick<Project, "presetNames" | "argsByPresetName"> & { system?: System }) {
    this.system = system || new RealSystem()
    this.presetNames = presetNames
    this.argsByPresetName = argsByPresetName
  }

  confgen() {
    const generatedCommands = []

    for (const presetName of this.presetNames) {
      this.system.silent ||
        console.log(`Generating commands for preset [${presetName}]...`)
      const generated = presets[presetName](
        this.presetNames,
        this.argsByPresetName
      )
      generated.forEach((command) => (command.preset = presetName))
      generatedCommands.push(...generated)
    }

    const distPackageCommands =
      generatedCommands.filter<DistPackageCommand>(isDistPackageCommand)

    const devPackageCommands =
      generatedCommands.filter<DevPackageCommand>(isDevPackageCommand)

    const otherCommands = generatedCommands.filter(
      ({ command }) => command !== "yarn"
    )

    const distPackages = distPackageCommands.map(({ pkg }) => pkg).join(" ")
    if (distPackages) {
      runCommand({ command: "yarn", pkg: distPackages }, this.system)
    }

    const devPackages = devPackageCommands.map(({ pkg }) => pkg).join(" ")
    if (devPackages) {
      runCommand({ command: "yarn", pkg: devPackages, dev: true }, this.system)
    }

    for (const command of otherCommands) {
      runCommand(command, this.system)
    }
  }
}
