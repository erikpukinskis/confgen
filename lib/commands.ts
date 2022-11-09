import merge from "merge-objects"
import YAML from "yaml"
import { type Args } from "~/args"
import { dedupe } from "~/dedupe"
import { formatJson } from "~/format"
import { type PresetName } from "~/presets"
import type { Runtime } from "~/runtimes"
import { type System } from "~/system"

export type Runtimes = Runtime[]

export type { System } from "~/system"

export type { Args } from "~/args"

export type Command = "file" | "run" | "script" | "package"

export type FileCommand = {
  command: "file"
  path: string
  contents: string | string[] | Record<string, unknown>
  merge?: "if-not-exists" | "prefer-existing" | "prefer-preset" | "replace"
}

export type RunCommand = {
  command: "run"
  script: string
}

export type ScriptCommand = {
  command: "script"
  name: string
  script: string
}

export type CommandWithArgs = { preset?: PresetName } & (
  | FileCommand
  | RunCommand
  | ScriptCommand
  | PackageCommand
)

export function isDistPackageCommand(
  command: CommandWithArgs
): command is DistPackageCommand {
  return isPackageCommand(command) && !command.dev
}

export type DistPackageCommand = {
  command: "package"
  dev?: false
  pkg: string
  version?: string
}

export type DevPackageCommand = {
  command: "package"
  dev: true
  pkg: string
  version?: string
}

export type PackageCommand = DistPackageCommand | DevPackageCommand

export function isDevPackageCommand(
  command: CommandWithArgs
): command is DevPackageCommand {
  return isPackageCommand(command) && Boolean(command.dev)
}

export function isPackageCommand(
  command: CommandWithArgs
): command is PackageCommand {
  return command.command === "package"
}

export type Presets = PresetName[]

export type CommandGenerator = (input: {
  runtimes: Runtime[]
  presets: Presets
  args: Args
  system: System
}) => CommandWithArgs[] | Promise<CommandWithArgs[]>

export type Precheck = (input: {
  runtimes: Runtime[]
  presets: Presets
  args: Args
  system: System
}) => void

type FileChanges = string | string[] | Record<string, unknown>

const descriptions: Record<string, string> = {
  file: "Updating file",
  run: "Running command",
  script: "Updating script in package.json",
  package: "Adding package(s) to package.json",
  devPackage: "Adding development package(s) to package.json",
}

export const runCommand = async (command: CommandWithArgs, system: System) => {
  await tick()

  const descriptionKey = isDevPackageCommand(command)
    ? "devPackage"
    : command.command

  let log = ""

  if (!system.silent) {
    log += "————————————————————————————————————————————————\n"

    const presetDetails = command.preset ? `[${command.preset}] ` : ""
    log += `👷 ${descriptions[descriptionKey]} ${presetDetails}\n`
    if (command.command === "file") {
      log += `   updating ${command.path}\n`
    } else if (command.command === "run") {
      log += `   running ${command.script}\n`
    } else if (command.command === "script") {
      log += `   updating ${command.name} script\n`
    } else if (command.command === "package") {
      log += `   adding package ${command.pkg}${
        command.version ? `@${command.version}` : ""
      }\n`
    }
  }

  await logAndRun(log, async () => {
    // @ts-expect-error Typescript doesn't know that command.command narrows the type sufficiently here
    await commands[command.command](command, system)
  })
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve))

/**
 * We'd like to be able to log stuff out in the main JavaScript thread, and then
 * also proxy through logs via execSync, but unfortunately the logs get kind of
 * mixed up. Sometimes execSync will beat the console log function to the
 * buffer. Even when using process.stdout.write with callback, sometimes the
 * output from calling execSync in the execSync seems to clobber the
 * stdout.write.
 *
 * So to solve that, this function uses the stdout.write callback trick, and
 * also introduces an extra tick before attempting the write.
 *
 * This seems to work fairly reliably, but who knows it could require further
 * tweaks.
 */
const logAndRun = async (log: string, func: () => void | Promise<void>) => {
  await tick()
  return new Promise<void>((resolve) => {
    process.stdout.write(log, () => {
      const promise = func()
      if (promise) {
        void promise.then(resolve)
      } else {
        resolve()
      }
    })
  })
}

const commands = {
  file: async ({ path, contents, merge }: FileCommand, system: System) => {
    if (merge === "if-not-exists" && system.exists(path)) {
      return
    } else if (merge === "replace") {
      writeFile(path, contents, system)
    } else {
      await syncFile(path, contents, merge === "prefer-existing", system)
    }
  },
  run: ({ script }: RunCommand, system: System) => {
    const { status } = system.run(script)
    if (status !== 0) {
      throw new Error(`Command failed: ${script}`)
    }
  },
  script: async ({ name, script }: ScriptCommand, system: System) => {
    await amendJson(
      "package.json",
      {
        scripts: {
          [name]: script,
        },
      },
      false,
      system
    )
  },
  package: (command: PackageCommand, system: System) => {
    system.addPackage(command.pkg, isDevPackageCommand(command))
  },
} as const

const syncFile = async (
  filename: string,
  changes: FileChanges,
  preferExisting: boolean,
  system: System
) => {
  if (/[.]ya?ml$/.test(filename)) {
    amendYaml(filename, changes, preferExisting, system)
  } else if (Array.isArray(changes)) {
    ensureLines(filename, changes, system)
  } else if (typeof changes === "string") {
    system.write(filename, changes)
  } else {
    await amendJson(filename, changes, preferExisting, system)
  }
}

const writeFile = (filename: string, contents: FileChanges, system: System) => {
  if (/[.]ya?ml$/.test(filename)) {
    system.write(filename, YAML.stringify(contents))
  } else if (Array.isArray(contents)) {
    system.write(filename, contents.join("\n") + "\n")
  } else if (typeof contents === "string") {
    system.write(filename, contents)
  } else {
    system.write(filename, formatJson(contents))
  }
}

const ensureLines = (filename: string, newLines: string[], system: System) => {
  const originalContents = system.exists(filename) ? system.read(filename) : ""
  const lines = originalContents.split("\n")
  for (const line of newLines) {
    if (lines.includes(line)) continue
    lines.unshift(line)
  }
  system.write(filename, lines.join("\n"))
}

export const readJson = <Format extends Record<string, unknown>>(
  filename: string,
  system: System
): Format => {
  const contents = system.exists(filename) ? system.read(filename) : "{}"

  let json: Format
  try {
    json = JSON.parse(contents) as Format
  } catch (e: unknown) {
    throw new Error(
      `${(e as Error).message}:\n\n${filename}\n———————\n${contents}`
    )
  }

  return json
}

const amendJson = async (
  filename: string,
  json: Record<string, unknown>,
  preferExisting: boolean,
  system: System
) => {
  const originalJson = readJson(filename, system)

  const newJson = dedupe(
    preferExisting ? merge(json, originalJson) : merge(originalJson, json)
  )
  system.write(filename, await formatJson(newJson))
}

const amendYaml = (
  filename: string,
  changes: FileChanges,
  preferExisting: boolean,
  system: System
) => {
  if (typeof changes === "string" || Array.isArray(changes)) {
    throw new Error(
      `Cannot amend YAML file ${filename} with a string or array. Contents must be an object.`
    )
  }

  const originalYaml = system.exists(filename)
    ? (YAML.parse(system.read(filename)) as Record<string, unknown>)
    : {}

  if (Array.isArray(originalYaml)) {
    throw new Error(
      `YAML file ${filename} is an array, but we only know how to sync objects`
    )
  }

  const newYaml = dedupe(
    preferExisting ? merge(changes, originalYaml) : merge(originalYaml, changes)
  )

  system.write(filename, YAML.stringify(newYaml))
}
