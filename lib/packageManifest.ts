import type { Contribution } from "./contributions.js"
import type { RuntimeName } from "./runtimes.js"
import type { Selection } from "./selection.js"

/**
 * Package-manifest owner for lifecycle scripts. Aggregate commands are chosen
 * from the complete selection here so preset order cannot change them.
 * Contributions are recorded as `preset:yarn` because they live in the
 * Yarn-managed package manifest.
 */
export function packageManifestContributions(
  selection: Selection
): readonly Contribution[] {
  const scripts = [script("confgen", confgenCommand(selection))]
  const build = aggregateBuild(selection)
  if (build !== undefined) scripts.push(script("build", build))
  const fix = aggregateFix(selection)
  if (fix !== undefined) scripts.push(script("fix", fix))
  return scripts
}

const BUILD_SCRIPTS: Partial<Record<RuntimeName, string>> = {
  lib: "build:lib",
  server: "build:server",
}

function aggregateBuild(selection: Selection): string | undefined {
  if (!selection.presets.includes("vite")) return undefined
  const commands = selection.runtimes.flatMap((runtime) => {
    const name = BUILD_SCRIPTS[runtime]
    return name === undefined ? [] : [`yarn ${name}`]
  })
  if (commands.length === 0) return undefined
  return commands.join(" && ")
}

function aggregateFix(selection: Selection): string | undefined {
  const commands: string[] = []
  if (selection.presets.includes("eslint")) commands.push("yarn fix:lint")
  if (selection.presets.includes("prettier")) commands.push("yarn fix:format")
  if (commands.length === 0) return undefined
  return commands.join(" && ")
}

function confgenCommand(selection: Selection): string {
  const runtimes = selection.runtimes.map((runtime) => `#${runtime}`).join(",")
  const command = `confgen runtimes=${runtimes}`
  if (selection.presets.length === 0) return command
  return `${command} ${selection.presets.join(" ")}`
}

function script(name: string, command: string): Contribution {
  return {
    id: `package-manifest:${name}`,
    source: "preset:yarn",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
