import { Command } from "./types"
import { execSync } from "child_process"
import merge from "merge-objects"
import { readFileSync, writeFileSync } from "fs"

export const commands: Record<Command, Function> = {
  file: (
    filename: string,
    value: string | string[] | Record<string, unknown>
  ) => {
    if (Array.isArray(value)) {
      ensureLines(filename, value)
    } else if (typeof value === "string") {
      writeFileSync(filename, value)
    } else {
      amendJson(filename, value)
    }
  },
  "executable": (...args) => {
    // @ts-ignore
    this.file(...args)
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

const ensureLines = (filename: string, newLines: string[]) => {
  const originalContents = readFileSync(filename).toString()
  const lines = originalContents.split("\n")
  for (const line of newLines) {
    if (lines.includes(line)) continue
    lines.push(line)
  }
  writeFileSync(filename, lines.join("\n"))
}

const amendJson = (filename: string, json: Record<string, unknown>) => {
  const originalContents = readFileSync(filename).toString()
  console.log("original", originalContents)
  const originalJson = JSON.parse(originalContents)
  const newJson = merge(originalJson, json)
  console.log("updates", JSON.stringify(newJson, null, 2))
  writeFileSync(filename, JSON.stringify(newJson, null, 2))
}
