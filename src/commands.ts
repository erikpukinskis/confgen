import { CommandWithArgs, isDevPackageCommand } from "./types"
import { execSync } from "child_process"
import merge from "merge-objects"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"
import uniq from "lodash/uniq"
import get from "lodash/get"

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
    skipIfExists,
  }: {
    path: string
    contents: string | string[] | Record<string, unknown>
    skipIfExists?: boolean
  }) => {
    if (skipIfExists && existsSync(path)) return
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
