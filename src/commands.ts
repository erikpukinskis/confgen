import { CommandWithArgs, isDevPackageCommand } from "./types"
import { execSync } from "child_process"
import merge from "merge-objects"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"
import uniq from "lodash/uniq"
import YAML from "yaml"

type FileChanges = string | string[] | Record<string, unknown>

const descriptions: Record<string, string> = {
  file: "Updating file",
  run: "Running command",
  script: "Updating script in package.json",
  yarn: "Adding package(s) to package.json",
  yarnDev: "Adding development package(s) to package.json",
}

export const runCommand = (command: CommandWithArgs) => {
  const descriptionKey = isDevPackageCommand(command)
    ? "yarnDev"
    : command.command
  console.log(`----------------------------------------
👷 ${descriptions[descriptionKey]}${
    command.preset ? ` for preset [${command.preset}]` : ""
  }...
   ${command[Object.keys(command)[1] as keyof CommandWithArgs]}`)

  // @ts-expect-error Typescript doesn't know that command.command narrows the type sufficiently here
  commands[command.command](command)
}

const commands = {
  file: ({
    path,
    contents,
  }: {
    path: string
    contents: string | string[] | Record<string, unknown>
  }) => {
    syncFile(path, contents)
  },
  run: ({ script }: { script: string }) => {
    execSync(script, { stdio: "inherit" })
  },
  script: ({ name, script }: { name: string; script: string }) => {
    amendJson("package.json", {
      scripts: {
        [name]: script,
      },
    })
  },
  yarn: ({ dev, pkg }: { dev?: boolean; pkg: string }) => {
    const dashDev = dev ? "-D " : ""
    execSync(`yarn add ${dashDev}${pkg}`, { stdio: "inherit" })
  },
} as const

const syncFile = (filename: string, changes: FileChanges) => {
  if (/[.]ya?ml$/.test(filename)) {
    amendYaml(filename, changes)
  } else if (Array.isArray(changes)) {
    ensureLines(filename, changes)
  } else if (typeof changes === "string") {
    outputFileSync(filename, changes)
  } else {
    amendJson(filename, changes)
  }
}

const ensureLines = (filename: string, newLines: string[]) => {
  const originalContents = existsSync(filename)
    ? readFileSync(filename).toString()
    : ""
  const lines = originalContents.split("\n")
  for (const line of newLines) {
    if (lines.includes(line)) continue
    lines.unshift(line)
  }
  outputFileSync(filename, lines.join("\n"))
}

const amendJson = (filename: string, json: Record<string, unknown>) => {
  const originalContents = existsSync(filename)
    ? readFileSync(filename).toString()
    : "{}"
  const originalJson = JSON.parse(originalContents)
  const newJson = dedupe(merge(originalJson, json))
  outputFileSync(filename, JSON.stringify(newJson, null, 2))
}

type Json = Record<string, unknown>

const dedupe = (json: Json) => {
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      json[key] = uniq(value)
    } else if (typeof value === "object") {
      json[key] = dedupe(value as Json)
    }
  }
  return json
}

const amendYaml = (filename: string, changes: FileChanges) => {
  if (typeof changes === "string" || Array.isArray(changes)) {
    throw new Error(
      `Cannot amend YAML file ${filename} with a string or array. Contents must be an object.`
    )
  }

  const originalYaml = existsSync(filename)
    ? YAML.parse(readFileSync(filename).toString())
    : {}

  if (Array.isArray(originalYaml)) {
    throw new Error(
      `YAML file ${filename} is an array, but we only know how to sync objects`
    )
  }

  const newYaml = dedupe(merge(originalYaml, changes))

  outputFileSync(filename, YAML.stringify(newYaml))
}
