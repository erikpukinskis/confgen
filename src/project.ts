import { precheck, generate } from "@/presets"
import { type Args, parsePresetConfigs, type GlobalArg } from "@/args"
import { type PresetName } from "@/presets"
import {
  runCommand,
  type DistPackageCommand,
  isDistPackageCommand,
  type DevPackageCommand,
  isDevPackageCommand,
} from "./commands"
import { RealSystem, type System } from "@/system"
import { type Build } from "@/builds"

type ProjectOptions = {
  system?: System
  builds: Build[]
  presetConfigs: string[]
  globalArgs?: Record<GlobalArg, string>
}

export class Project {
  system: System
  builds: Build[]
  presetNames: PresetName[]
  argsByPresetName: Args

  constructor({
    system,
    builds,
    presetConfigs,
    globalArgs = {},
  }: ProjectOptions) {
    this.system = system || new RealSystem()
    this.builds = builds
    const { presetNames, argsByPresetName } = parsePresetConfigs(
      presetConfigs,
      globalArgs
    )
    this.presetNames = presetNames
    this.argsByPresetName = argsByPresetName
  }

  async confgen() {
    for (const presetName of this.presetNames) {
      precheck(presetName, this.presetNames, this.argsByPresetName, this.system)
    }

    const generatedCommands = []

    for (const presetName of this.presetNames) {
      this.system.silent ||
        console.log(`Generating commands for preset [${presetName}]...`)
      const generated = generate(
        presetName,
        this.builds,
        this.presetNames,
        this.argsByPresetName,
        this.system
      )
      generated.forEach((command) => {
        command.preset = presetName
      })
      generatedCommands.push(...generated)
    }

    const distPackageCommands =
      generatedCommands.filter<DistPackageCommand>(isDistPackageCommand)

    const devPackageCommands =
      generatedCommands.filter<DevPackageCommand>(isDevPackageCommand)

    const otherCommands = generatedCommands.filter(
      ({ command }) => command !== "yarn"
    )

    if (distPackageCommands.length > 0) {
      const distPackages = distPackageCommands.map(({ pkg }) => pkg).join(" ")
      await runCommand({ command: "yarn", pkg: distPackages }, this.system)
    }

    if (devPackageCommands.length > 0) {
      const devPackages = devPackageCommands.map(({ pkg }) => pkg).join(" ")
      await runCommand(
        { command: "yarn", pkg: devPackages, dev: true },
        this.system
      )
    }

    for (const command of otherCommands) {
      await runCommand(command, this.system)
    }
  }
}
