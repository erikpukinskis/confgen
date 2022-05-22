import path from "path"
import { existsSync, readFileSync } from "fs"
import { Project } from "./project"

const [, , ...configs] = process.argv

configs.unshift("all", "git")

// Eslint makes things better, and Prettier makes things pretty so we want
// prettier to be last and eslint to be second-to-last
if (configs.includes("eslint")) {
  const index = configs.indexOf("eslint")
  configs.splice(index, 1)
  configs.push("eslint")
}
if (configs.includes("prettier")) {
  const index = configs.indexOf("prettier")
  configs.splice(index, 1)
  configs.push("prettier")
}

const getVersion = () => {
  let packageJsonPath = path.join(__dirname, "..", "package.json")
  if (!existsSync(packageJsonPath)) {
    packageJsonPath = path.join(__dirname, "..", "..", "package.json")
  }
  if (!existsSync(packageJsonPath)) {
    return "unknown"
  }
  const contents = readFileSync(packageJsonPath).toString()
  const json = JSON.parse(contents)
  return json.version
}

console.log(`----------------------------------------
👷 Running confgen@${getVersion()}
----------------------------------------`)

const project = new Project({ presetConfigs: configs })

project.confgen()
