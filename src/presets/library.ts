import { CommandGenerator, Preset } from "@/types"

export const library: CommandGenerator = (presets) => [
  {
    command: "script",
    name: "build",
    script: buildScript(presets),
  },
]

const buildScript = (presets: Preset[]) => {
  const scripts = ["rm -rf dist/*"]
  if (presets.includes("codegen")) {
    scripts.push("yarn run build:generate")
  }
  if (presets.includes("vite")) {
    scripts.push("yarn run build:vite")
  }
  if (presets.includes("typescript")) {
    scripts.push("yarn run build:types")
  }
  if (presets.includes("bin")) {
    scripts.push("yarn run build:bin")
  }
  return scripts.join("; ")
}
