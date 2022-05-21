import { PRESETS, isPreset, Args } from "./types"
import path from "path"
import { existsSync, readFileSync } from "fs"
import { Project } from "./project"

const [, , ...args] = process.argv

args.unshift("all", "git")

// Eslint makes things better, and Prettier makes things pretty so we want
// prettier to be last and eslint to be second-to-last
if (args.includes("eslint")) {
  const index = args.indexOf("eslint")
  args.splice(index, 1)
  args.push("eslint")
}
if (args.includes("prettier")) {
  const index = args.indexOf("prettier")
  args.splice(index, 1)
  args.push("prettier")
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

const argsByPresetName = PRESETS.reduce(
  (args, preset) => ({
    ...args,
    [preset]: [],
  }),
  {} as Args
)

const presetNames = args.map((arg) => {
  const [presetName, ...presetArgs] = arg.split(":")
  if (!isPreset(presetName)) {
    throw new Error(
      `${presetName} is not a valid preset.\n\nUsage:\nnpx confgen [${PRESETS.join(
        " | "
      )}]\n`
    )
  }
  argsByPresetName[presetName] = presetArgs
  return presetName
})

const project = new Project({ presetNames, argsByPresetName })

project.confgen()
