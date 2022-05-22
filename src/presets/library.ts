import { CommandGenerator, Presets, System } from "@/types"

export const library: CommandGenerator = (presets, _, system) => [
  {
    command: "script",
    name: "build",
    script: buildScript(presets, system),
  },
]

const buildScript = (presets: Presets, system: System) => {
  const packageJson = system.read("package.json")

  const scripts = ((): string[] => {
    if (!packageJson) return []
    const json = JSON.parse(packageJson)
    const buildScript = json.scripts?.build
    if (!buildScript) return []
    return buildScript.split(" && ")
  })()

  const prepend = (script: string) => {
    if (scripts.includes(script)) return
    scripts.unshift(script)
  }

  const append = (script: string) => {
    if (scripts.includes(script)) return
    scripts.push(script)
  }

  if (presets.includes("typescript")) {
    append("yarn build:types")
  }
  if (presets.includes("bin")) {
    append("yarn build:bin")
  }

  if (presets.includes("vite")) {
    prepend("yarn build:vite")
  }

  if (presets.includes("codegen")) {
    prepend("yarn build:generate")
  }

  prepend("rm -rf dist/*")

  return scripts.join(" && ")
}
