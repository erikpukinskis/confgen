import path from "path"
import { existsSync, readFileSync } from "fs"
import { Project } from "./project"
import { parseArgs, addDefaultPresets } from "./parseArgs"

const [, , ...args] = process.argv

const { presetConfigs, builds, globalArgs } = parseArgs(args)

addDefaultPresets(presetConfigs)

const getVersion = () => {
  let packageJsonPath = path.join(__dirname, "..", "package.json")
  if (!existsSync(packageJsonPath)) {
    packageJsonPath = path.join(__dirname, "..", "..", "package.json")
  }
  if (!existsSync(packageJsonPath)) {
    return "unknown"
  }
  const contents = readFileSync(packageJsonPath).toString()
  const json = JSON.parse(contents) as { version?: string }
  return json.version
}

console.log(`----------------------------------------
👷 Running confgen@${getVersion()}
----------------------------------------`)

const project = new Project({ presetConfigs, builds, globalArgs })

project.confgen()
