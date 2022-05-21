import { presets } from "./presets"
import {
  PRESETS,
  Preset,
  DistPackageCommand,
  isDistPackageCommand,
  DevPackageCommand,
  isDevPackageCommand,
  Args,
} from "./types"
import { runCommand } from "./commands"
import path from "path"
import { existsSync, readFileSync } from "fs"

class RealFilesystem {}

export class Project {
  filesystem = new RealFilesystem()
  presetNames: Preset[]
  argsByPresetName: Record<Preset,string[]>

  constructor({ presetNames, argsByPresetName }: Pick<Project, 'presetNames' | 'argsByPresetName'>) {
    this.presetNames = presetNames
    this.argsByPresetName = argsByPresetName
  }

  confgen() {
    const generatedCommands = []
    
    for (const presetName of this.presetNames) {
      console.log(`Generating commands for preset [${presetName}]...`)
      const generated = presets[presetName](this.presetNames, this.argsByPresetName)
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
      runCommand({ command: "yarn", pkg: distPackages })
    }
    
    const devPackages = devPackageCommands.map(({ pkg }) => pkg).join(" ")
    if (devPackages) {
      runCommand({ command: "yarn", pkg: devPackages, dev: true })
    }
    
    for (const command of otherCommands) {
      runCommand(command)
    }
  }
}

class MockFilesystem {}

export class MockProject extends Project {
  filesystem = new MockFilesystem()
}

