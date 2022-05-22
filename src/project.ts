import { precheck, generate } from "@/presets"
import { type Args, EMPTY_ARGS } from "@/args"
import { type Presets } from "@/presets"
import {
  runCommand,
  type DistPackageCommand,
  isDistPackageCommand,
  type DevPackageCommand,
  isDevPackageCommand,
} from "./commands"
import { RealSystem, type System } from "./system"
import { parsePresetConfigs } from "./args"

export class Project {
  system: System
  presetNames: Presets
  argsByPresetName: Args

  constructor({
    presetConfigs,
    system,
  }: {
    presetConfigs: string[]
    system?: System
  }) {
    this.system = system || new RealSystem()
    const { presetNames, argsByPresetName } = parsePresetConfigs(presetConfigs)
    this.presetNames = presetNames
    this.argsByPresetName = argsByPresetName
  }

  confgen() {
    const args = {
      ...EMPTY_ARGS,
      ...this.argsByPresetName,
    }

    for (const presetName of this.presetNames) {
      precheck(presetName, this.presetNames, args, this.system)
    }

    const generatedCommands = []

    for (const presetName of this.presetNames) {
      this.system.silent ||
        console.log(`Generating commands for preset [${presetName}]...`)
      const generated = generate(
        presetName,
        this.presetNames,
        args,
        this.system
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
