import { Command } from "./types"
import { execSync } from "child_process"
import merge from "merge-objects"
import { existsSync, readFileSync, writeFile } from "fs"
import { outputFileSync } from "fs-extra"

type FileChanges = string | string[] | Record<string, unknown>

export const commands: Record<Command, Function> = {
  file: (filename: string, value: FileChanges) => {
    syncFile(filename, value)
  },
  "executable": (
    filename: string,
    value: string | string[] | Record<string, unknown>
  ) => {
    syncFile(filename, value)
    execSync(`chmod a+x ${filename}`)
  },
  yarn: (...args: string[]) => {
    let name: string
    let dev: string
    let version: string
    if (args[0] === "dev") {
      name = args[1]
      version = args[2]
      dev = "-D "
    } else {
      name = args[0]
      version = args[1]
      dev = ""
    }
    execSync(`yarn add ${dev}${name}@${version}`)
  },
  "script": (...args: string[]) => {
    const command = args.pop()
    const scriptName = args.join(":")

    amendJson("package.json", {
      "scripts": {
        [scriptName]: command,
      },
    })
  },
}

const syncFile = (filename: string, changes: FileChanges) => {
  if (Array.isArray(changes)) {
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
    lines.push(line)
  }
  outputFileSync(filename, lines.join("\n"))
}

const amendJson = (filename: string, json: Record<string, unknown>) => {
  const originalContents = existsSync(filename)
    ? readFileSync(filename).toString()
    : "{}"
  console.log("original", originalContents)
  const originalJson = JSON.parse(originalContents)
  const newJson = merge(originalJson, json)
  console.log("updates", JSON.stringify(newJson, null, 2))
  outputFileSync(filename, JSON.stringify(newJson, null, 2))
}
