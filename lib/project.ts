import { precheck, generate } from "@/presets"
import { type Args, parsePresetConfigs, type GlobalArg } from "@/args"
import { type PresetName } from "@/presets"
import {
  runCommand,
  type DistPackageCommand,
  isDistPackageCommand,
  type DevPackageCommand,
  isDevPackageCommand,
  readJson,
  type PackageCommand,
} from "./commands"
import { type System } from "@/system"
import { type Build } from "@/builds"
import difference from "lodash/difference"

type ProjectOptions = {
  system: System
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

    await runCombinedInstall(
      generatedCommands.filter<DistPackageCommand>(isDistPackageCommand),
      false,
      this.system
    )

    await runCombinedInstall(
      generatedCommands.filter<DevPackageCommand>(isDevPackageCommand),
      true,
      this.system
    )

    const otherCommands = generatedCommands.filter(
      ({ command }) => command !== "yarn"
    )

    for (const command of otherCommands) {
      await runCommand(command, this.system)
    }
  }
}

/**
 * Takes an array of package commands and combines them into a single `yarn
 * add`. Skips packages already in the package.json.
 */
const runCombinedInstall = (
  commands: PackageCommand[],
  isDev: boolean,
  system: System
) => {
  const packageNames = commands.map(({ pkg }) => pkg)

  const deps = readJson("package.json", system)[
    isDev ? "devDependencies" : "dependencies"
  ] as Record<string, string>

  const installedPackageNames = Object.keys(deps || {})
  const packageNamesToInstall = difference(packageNames, installedPackageNames)

  if (packageNamesToInstall.length < 1) return

  return runCommand(
    {
      command: "yarn",
      pkg: packageNamesToInstall.join(" "),
    },
    system
  )
}
