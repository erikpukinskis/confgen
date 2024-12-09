import merge from "merge-objects"
import YAML from "yaml"
import { type Args } from "~/args"
import { dedupe } from "~/dedupe"
import { formatJson } from "~/format"
import { type PresetName } from "~/presets"
import type { Runtime } from "~/runtimes"
import { type System } from "~/system"
import { JsonObject } from "./helpers/json"
import { cloneDeep, get, set } from "lodash"

export type Runtimes = Runtime[]

export type { System } from "~/system"

export type { Args } from "~/args"

export type Command = "file" | "run" | "script" | "yarn"

type ResolutionStrategy =
  | "if-not-exists"
  | "prefer-existing"
  | "prefer-preset"
  | "replace"

export type FileCommand = {
  command: "file"
  path: string
  accessor?: string
  contents: string | string[] | Record<string, unknown>
  merge?: ResolutionStrategy
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

export const isDistPackageCommand =
  (system: System) =>
  (command: CommandWithArgs): command is DistPackageCommand => {
    if (!isPackageCommand(command)) return false
    if (isDistAlready(command.pkg, system)) return true
    return isPackageCommand(command) && !command.dev
  }

export type DistPackageCommand = {
  command: "yarn"
  dev?: false
  pkg: string
  version?: string
}

export type DevPackageCommand = {
  command: "yarn"
  dev: true
  pkg: string
  version?: string
}

export type PackageCommand = DistPackageCommand | DevPackageCommand

export const isDevPackageCommand =
  (system: System) =>
  (command: CommandWithArgs): command is DevPackageCommand => {
    if (!isPackageCommand(command)) return false
    if (isDevAlready(command.pkg, system)) return true
    return isPackageCommand(command) && Boolean(command.dev)
  }

export function isPackageCommand(
  command: CommandWithArgs
): command is PackageCommand {
  return command.command === "yarn"
}

function isDevAlready(pkg: string, system: System) {
  return getPackageType(pkg, system) === "dev"
}

function isDistAlready(pkg: string, system: System) {
  return getPackageType(pkg, system) === "dev"
}

type PackageJsonDependencies = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

export function getPackageType(
  pkg: string,
  system: System
): "dist" | "dev" | "peer" | undefined {
  const packageName = pkg.replace(/(.)@.+$/, "$1")

  const { dependencies, devDependencies, peerDependencies } =
    readJson<PackageJsonDependencies>("package.json", system)

  if (dependencies?.[packageName]) {
    return "dist"
  } else if (devDependencies?.[packageName]) {
    return "dev"
  } else if (peerDependencies?.[packageName]) {
    return "peer"
  } else {
    return undefined
  }
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
  yarn: "Adding package(s) to package.json",
  yarnDev: "Adding development package(s) to package.json",
}

export const runCommand = async (command: CommandWithArgs, system: System) => {
  await tick()

  const descriptionKey = isDevPackageCommand(system)(command)
    ? "yarnDev"
    : command.command

  let log = ""

  if (!system.silent) {
    log += "————————————————————————————————————————————————\n"

    const presetDetails = command.preset ? `[${command.preset}] ` : ""
    log += `👷 ${descriptions[descriptionKey]} ${presetDetails}\n`
    if (command.command === "file") {
      log += `   ${command.path}\n`
    } else if (command.command === "run") {
      log += `   ${command.script}\n`
    } else if (command.command === "script") {
      log += `   yarn run ${command.name}\n`
    } else if (command.command === "yarn") {
      log += `   ${command.pkg}${
        command.version ? `@${command.version}` : ""
      }\n`
    }
  }

  await logAndRun(log, async () => {
    // @ts-expect-error Typescript doesn't know that command.command narrows the type sufficiently here
    await COMMANDS[command.command](command, system)
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

const COMMANDS = {
  file: async (
    { path, contents, accessor, merge }: FileCommand,
    system: System
  ) => {
    await syncFile({
      path,
      changes: contents,
      accessor,
      resolution: merge,
      system,
    })
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
  yarn: (command: PackageCommand, system: System) => {
    system.addPackage(command.pkg, isDevPackageCommand(system)(command))
  },
} as const

type SyncFileArgs = {
  path: string
  accessor?: string
  changes: FileChanges
  resolution?: ResolutionStrategy
  system: System
}

const syncFile = async ({
  changes,
  resolution = "prefer-preset",
  path,
  system,
  accessor,
}: SyncFileArgs) => {
  if (resolution === "if-not-exists") {
    if (system.exists(path)) {
      return
    }
    resolution = "replace"
  }

  if (Array.isArray(changes)) {
    ensureLines(path, changes, system)
  }

  if (typeof changes === "string") {
    system.write(path, changes)
  }

  const content = assertJsonObject(changes)

  const format = /[.]ya?ml$/.test(path) ? "yaml" : "json"

  const originalObject =
    format === "yaml" ? readYaml(path, system) : readJson(path, system)
  const newObject = cloneDeep(originalObject)

  if (accessor) {
    const { base, query, memberKey, targetValue } = parseAccessor(accessor)

    if (query) {
      const originalArray =
        (get(originalObject, base) as Array<JsonObject>) ?? []
      const newArray = [...originalArray]
      const index = originalArray.findIndex(
        (item) => item[memberKey] === targetValue
      )

      if (index < 0) {
        newArray.push(content)
      } else {
        newArray[index] = getNewContent({
          existing: originalArray[index],
          content,
          resolution,
        })
      }

      set(newObject, base, newArray)
    } else {
      set(
        newObject,
        path,
        getNewContent({
          existing: assertJsonObject(
            get(originalObject, base),
            `${path} at accessor ${base}`
          ),
          content,
          resolution,
        })
      )
    }

    await writeFile(path, newObject, format, system)
  } else {
    await writeFile(
      path,
      getNewContent({
        existing: originalObject,
        content,
        resolution,
      }),
      format,
      system
    )
  }
}

/**
 * Parses an "accessor" which describes where data is to be merged into an
 * existing JSON/YAML file.
 *
 * Ex:
 *       parseAccessor("a.b.c") // returns { base: "a.b.c", query: undefined }
 *       parseAccessor("x[y=z]") // return { base: "x", query: "y=z" }
 *
 * Note: We considered using something like jmespath or other
 * suggestions here:
 *
 * https://stackoverflow.com/questions/8481380/is-there-a-json-equivalent-of-xquery-xpath.
 *
 * But after a quick scan, they mostly seemed to be read-only. No ability to
 * write content to a specific query. So we are rolling my own for now.
 */
export function parseAccessor(accessor: string) {
  const match = accessor.match(/^([^\[]*)(.*)?$/)

  if (!match) {
    throw new Error(
      `Invalid accessor: ${JSON.stringify(
        accessor
      )}. Try something like "foo.bar" or "foo.items[name=bar]".`
    )
  }

  const base = match[1]
  const query = match[2]?.slice(1, -1)

  if (!query) return { base }

  const [memberKey, targetValue] = query.split("=")

  if (!memberKey || !targetValue) {
    throw new Error(
      `Invalid query ${query} in accessor ${JSON.stringify(accessor)}`
    )
  }

  return { base, query, memberKey, targetValue }
}

type GetNewContentArgs = {
  existing: JsonObject
  content: JsonObject
  resolution: "prefer-existing" | "prefer-preset" | "replace"
}

/**
 * Returns a new JSON object with some new content merged in. Does it differently depending on the resolution strategy.
 *
 * For example, if the existing content is { "a": 1, "b": 2 } and the new content is { "b": 6, "c": 7 }...
 *
 *  - "replace" would return the new content ({ "b": 6, "c": 7 })
 *  - "prefer-existing" would return { "a": 1, "b": 2, "c": 7}
 *  - "prefer-preset" would return { "a": 1, "b": 6, "c": 7 }
 */
function getNewContent({
  existing,
  content,
  resolution = "prefer-preset",
}: GetNewContentArgs) {
  switch (resolution) {
    case "replace":
      return content
    case "prefer-existing":
      return merge(content, existing)
    case "prefer-preset":
      return merge(existing, content)
  }
}

const writeFile = async (
  filename: string,
  contents: JsonObject,
  format: "yaml" | "json",
  system: System
) => {
  switch (format) {
    case "yaml":
      system.write(filename, YAML.stringify(contents))

      break
    case "json":
      system.write(filename, await formatJson(contents))
      break
  }
}

const ensureLines = (filename: string, newLines: string[], system: System) => {
  if (/\.json$/i.test(filename)) {
    throw new Error(
      "Provided array contents (lines to ensure) for JSON file, which you probably don't want to do. Contents should be a JSON object."
    )
  }
  const originalContents = system.exists(filename) ? system.read(filename) : ""
  const lines = originalContents.split("\n")
  for (const line of newLines) {
    if (lines.includes(line)) continue
    lines.unshift(line)
  }
  system.write(filename, lines.join("\n"))
}

export const readJson = <Format extends JsonObject = JsonObject>(
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

  return assertJsonObject(json, filename) as Format
}

export function readYaml(filename: string, system: System) {
  const obj = system.exists(filename) ? YAML.parse(system.read(filename)) : {}

  return assertJsonObject(obj, filename)
}

function assertJsonObject(obj: unknown, filename?: string) {
  const nonObjectType =
    typeof obj !== "object"
      ? typeof obj
      : Array.isArray(obj)
      ? "array"
      : undefined

  if (nonObjectType) {
    const description = filename
      ? `File ${filename}`
      : `Contents ${JSON.stringify(obj)}`

    throw new Error(
      `${description} contained a ${nonObjectType} but we expect YAML files to have an object at the root`
    )
  }

  return obj as JsonObject
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
