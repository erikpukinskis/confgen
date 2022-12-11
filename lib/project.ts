import {
  runCommand,
  type DistPackageCommand,
  isDistPackageCommand,
  type DevPackageCommand,
  isDevPackageCommand,
  readJson,
  getPackageType,
  isPackageCommand,
} from "./commands"
import { sortPackageJson } from "./sortPackageJson"
import { type Args, parsePresetConfigs, type GlobalArg } from "~/args"
import { runCombinedInstall } from "~/packages"
import { precheck, generate, type PresetName } from "~/presets"
import { type Runtime } from "~/runtimes"
import { type System } from "~/system"

type ProjectOptions = {
  system: System
  runtimes: Runtime[]
  presetConfigs: string[]
  globalArgs?: Record<GlobalArg, string>
}

export class Project {
  system: System
  runtimes: Runtime[]
  presetNames: PresetName[]
  argsByPresetName: Args

  constructor({
    system,
    runtimes,
    presetConfigs,
    globalArgs = {},
  }: ProjectOptions) {
    if (!system) {
      // In theory the type checker shouldn't allow system to be undefined. But
      // we have a common pattern in tests where we define the system in a
      // closure outside of the beforeAll in which we call this Project
      // constructor. And neither TypeScript nor Eslint is smart enough to guess
      // whether a variable will be assigned before a nested function gets
      // called. So this runtime check will fail in that case.
      throw new Error("No System provided")
    }
    this.system = system
    this.runtimes = runtimes
    const { presetNames, argsByPresetName } = parsePresetConfigs(
      presetConfigs,
      globalArgs
    )
    this.presetNames = presetNames
    this.argsByPresetName = argsByPresetName
  }

  async confgen() {
    for (const presetName of this.presetNames) {
      precheck(
        presetName,
        this.runtimes,
        this.presetNames,
        this.argsByPresetName,
        this.system
      )
    }

    const generatedCommands = []

    for (const presetName of this.presetNames) {
      this.system.silent ||
        console.info(`Generating commands for preset [${presetName}]...`)
      const generated = await generate(
        presetName,
        this.runtimes,
        this.presetNames,
        this.argsByPresetName,
        this.system
      )

      generated.forEach((command) => {
        command.preset = presetName
      })
      generatedCommands.push(...generated)
    }

    const withoutPeer = generatedCommands.filter((command) => {
      if (!isPackageCommand(command)) return false
      const packageType = getPackageType(command.pkg, this.system)
      if (packageType === "peer") return false
      else return true
    })

    await runCombinedInstall(
      withoutPeer.filter<DistPackageCommand>(isDistPackageCommand(this.system)),
      this.system
    )

    await runCombinedInstall(
      withoutPeer.filter<DevPackageCommand>(isDevPackageCommand(this.system)),
      this.system
    )

    const otherCommands = generatedCommands.filter(
      ({ command }) => command !== "yarn"
    )

    for (const command of otherCommands) {
      await runCommand(command, this.system)
    }

    const packageJson = readJson("package.json", this.system)
    this.system.write("package.json", sortPackageJson(packageJson))
  }
}
