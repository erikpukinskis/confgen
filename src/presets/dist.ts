import type {
  CommandGenerator,
  Presets,
  System,
  Args,
  Precheck,
} from "@/commands"
import { isBuild } from "@/builds"

export const precheck: Precheck = ({ args, presets }) => {
  if (!presets.includes("vite")) {
    throw new Error("Cannot use the dist preset without the vite preset")
  }

  if (args.dist.length < 1) {
    throw new Error(
      "[dist] preset requires at least one build.\n\nTry dist:lib:app"
    )
  }

  for (const build of args.dist) {
    if (!isBuild(build)) {
      throw new Error(
        `${build} is not a valid build.\n\nTry dist:lib, dist:app, dist:server, dist:package or some combination of the four.`
      )
    }
  }
}

export const generator: CommandGenerator = ({ presets, system, args }) => [
  {
    command: "script",
    name: "build",
    script: buildScript(presets, system, args),
  },
]

const buildScript = (presets: Presets, system: System, args: Args) => {
  const scripts = getExistingBuildScripts(system)

  const prepend = (script: string) => {
    if (scripts.includes(script)) return
    scripts.unshift(script)
  }

  const append = (script: string) => {
    if (scripts.includes(script)) return
    scripts.push(script)
  }

  // We only need this if we are building a library OR a package

  if (presets.includes("typescript")) {
    append("yarn build:types")
  }
  if (presets.includes("bin")) {
    append("yarn build:bin")
  }

  for (const build of args.dist || []) {
    prepend(`yarn build:${build}`)
  }

  if (presets.includes("codegen")) {
    prepend("yarn build:generate")
  }

  prepend("rm -rf dist/*")

  return scripts.join(" && ")
}

/**
 * If we already have a "yarn build" script, return the individual parts of it
 * so people can slip their own custom ones in there. #dontclobbertheconfigs
 */
const getExistingBuildScripts = (system: System) => {
  const packageJson = system.read("package.json")

  if (!packageJson) return []

  const json = JSON.parse(packageJson) as { scripts?: Record<string, string> }
  const buildScript = json.scripts?.build

  if (!buildScript) return []

  return buildScript.split(" && ")
}
