import merge from "merge-objects"
import uniq from "lodash/uniq"
import get from "lodash/get"
import YAML from "yaml"
import { type System } from "./system"
import { type PresetName, type Presets } from "./presets"
import { type Args } from "./args"

export type Command = "file" | "run" | "script" | "yarn"

export type FileCommand = {
  command: "file"
  path: string
  contents: string | string[] | Record<string, unknown>
  merge?: "if-not-exists" | "prefer-existing" | "prefer-preset"
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
  return command.command === "yarn" && !(command as DevPackageCommand).dev
}

export type DistPackageCommand = {
  command: "yarn"
  pkg: string
}

export type DevPackageCommand = DistPackageCommand & {
  dev: true
}

export type PackageCommand = DistPackageCommand | DevPackageCommand

export function isDevPackageCommand(
  command: CommandWithArgs
): command is DevPackageCommand {
  return command.command === "yarn" && (command as DevPackageCommand).dev
}

export type CommandGenerator = (
  presets: Presets,
  args: Args,
  system: System
) => CommandWithArgs[]

export type Precheck = (presets: Presets, args: Args, system: System) => void

type FileChanges = string | string[] | Record<string, unknown>

const descriptions: Record<string, string> = {
  file: "Updating file",
  run: "Running command",
  script: "Updating script in package.json",
  yarn: "Adding package(s) to package.json",
  yarnDev: "Adding development package(s) to package.json",
}

export const runCommand = (command: CommandWithArgs, system: System) => {
  const descriptionKey = isDevPackageCommand(command)
    ? "yarnDev"
    : command.command

  system.silent ||
    console.log(`----------------------------------------
👷 ${descriptions[descriptionKey]}${
      command.preset ? ` for preset [${command.preset}]` : ""
    }...
   ${command[Object.keys(command)[1] as keyof CommandWithArgs]}`)

  // @ts-expect-error Typescript doesn't know that command.command narrows the type sufficiently here
  commands[command.command](command, system)
}

const commands = {
  file: ({ path, contents, merge }: FileCommand, system: System) => {
    if (merge === "if-not-exists" && system.exists(path)) return
    syncFile(path, contents, merge === "prefer-existing", system)
  },
  run: ({ script }: RunCommand, system: System) => {
    system.run(script)
  },
  script: ({ name, script }: ScriptCommand, system: System) => {
    amendJson(
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
  yarn: (command: PackageCommand, system: System) => {
    system.addPackage(command.pkg, isDevPackageCommand(command))
  },
} as const

const syncFile = (
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
    amendJson(filename, changes, preferExisting, system)
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

const amendJson = (
  filename: string,
  json: Record<string, unknown>,
  preferExisting: boolean,
  system: System
) => {
  const originalContents = system.exists(filename)
    ? system.read(filename)
    : "{}"
  const originalJson = JSON.parse(originalContents)
  const newJson = dedupe(
    preferExisting ? merge(json, originalJson) : merge(originalJson, json)
  )
  system.write(filename, JSON.stringify(newJson, null, 2))
}

type Json = Record<string, unknown>

const dedupe = (json: Json) => {
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      json[key] = specialUnique(value)
    } else if (typeof value === "object") {
      json[key] = dedupe(value as Json)
    }
  }
  return json
}

/**
 * We want to dedupe arrays, otherwise something like the files config in a
 * package.json would eventually look like "files": ["dist", "dist", etc...]
 *
 * For a simple case like that, the lodash uniq function works perfectly well,
 * so we run that first.
 *
 * However, is a case in the graphql codegen.yml file where we want to dedupe
 * the plugins array, and that array can contain objects. In particular the
 * "add" plugin will often be used several times.
 *
 * So we can dedupe the add plugin by adding a unique comment to the end of the
 * content, in this case we add "//@contextType" at the end of the line.
 *
 * This function will keep only the last matching line with any comment like
 * that.
 */
const specialUnique = (arr: unknown[]) => {
  arr = uniq(arr)

  const taggedItems: Record<string, number[]> = {}

  for (const [index, item] of arr.entries()) {
    // For now we only look for tags on items like:
    //   { add: { content: "... //@tag" } }
    // but in the future we may need to apply this to more types of objects!
    const content = get(item, "add.content")
    if (!content) continue

    const matches = content.match(/\/\/@([a-z]+)/i)

    if (!matches) continue

    const tag = matches[1]

    if (!taggedItems[tag]) {
      taggedItems[tag] = []
    }

    // This first step collects up the indexes of every tagged item, one array
    // of indexes for each tag
    taggedItems[tag].push(index)
  }

  // Then we are going to look at each of those sets of indexes individually,
  // and remove all but the last one. We start by just setting them to undefined
  // so all the indexes stay the same, and then we'll remove the undefineds when
  // we're done.
  for (const indexes of Object.values(taggedItems)) {
    const oldIndexes = indexes.slice(0, -1) // all but the last item
    for (const index of oldIndexes) {
      arr[index] = undefined
    }
  }

  return arr.filter((item) => item != null) // remove the undefineds
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
    ? YAML.parse(system.read(filename))
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
