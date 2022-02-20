import { Command } from "./types"
import { execSync } from "child_process"
import merge from "merge-objects"
import { existsSync, readFileSync, rmSync } from "fs"
import { outputFileSync } from "fs-extra"
import uniq from "lodash/uniq"

type FileChanges = string | string[] | Record<string, unknown>

const announce = (command: string, data: string) => {
  console.log(`----------------------------------------
👷‍♀️ ${command}
   ${data}`)
}
export const commands: Record<Command, Function> = {
  file: ({
    path,
    contents,
  }: {
    path: string
    contents: string | string[] | Record<string, unknown>
  }) => {
    announce("Amending file...", path)
    syncFile(path, contents)
  },
  run: ({ script }: { script: string }) => {
    announce("Running...", script)
    execSync(script, { stdio: "inherit" })
  },
  "script": ({ name, script }: { name: string; script: string }) => {
    announce("Updating \"${name}\" script in package.json...", script)
    amendJson("package.json", {
      "scripts": {
        [name]: script,
      },
    })
  },
  yarn: ({ dev, pkg }: { dev?: boolean; pkg: string }) => {
    announce("Adding package to package.json...", pkg)
    const dashDev = dev ? "-D " : ""
    execSync(`yarn add ${dashDev}${pkg}`, { stdio: "inherit" })
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
