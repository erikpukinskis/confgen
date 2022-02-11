import { CommandGenerator, Preset } from "@/types"

export const library: CommandGenerator = (presets) => [
  {
    command: "script",
    name: "build",
    script: buildScript(presets),
  },
]

const buildScript = (presets: Preset[]) => {
  let script = "rm -rf dist/*"
  if (presets.includes("apollo")) {
    script += "; npm run build:generate"
  }
  if (presets.includes("vite")) {
    script += "; npm run build:vite"
  }
  if (presets.includes("typescript")) {
    script += "; npm run build:types"
  }
  if (presets.includes("bin")) {
    script += "; npm run build:bin"
  }
  return script
}
