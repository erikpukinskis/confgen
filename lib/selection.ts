import { ConfgenError } from "./errors.js"
import {
  isPresetName,
  PRESET_NAMES,
  type PresetName,
} from "./presets/registry.js"
import { isRuntimeName, RUNTIME_NAMES, type RuntimeName } from "./runtimes.js"

export type Selection = {
  runtimes: readonly RuntimeName[]
  presets: readonly PresetName[]
}

const runtimeGroupPrefix = "runtimes="

/**
 * Parses one `runtimes=` group and positional preset names.
 * Reports every missing, empty, unknown, or duplicate name together.
 * The returned lists follow the canonical registries, not CLI order.
 */
export function parseSelection(args: readonly string[]): Selection {
  const problems: string[] = []
  const first = args[0]

  if (first === undefined || !first.startsWith(runtimeGroupPrefix)) {
    throw new ConfgenError([
      "Missing runtime group. Expected runtimes=#name[,#name...].",
    ])
  }

  const body = first.slice(runtimeGroupPrefix.length)
  const runtimeTokens = body.length === 0 ? [] : body.split(",")
  if (body.length === 0) {
    problems.push("Runtime group is empty.")
  }

  const runtimes = selectedRuntimes(runtimeTokens, problems)
  const presets = selectedPresets(args.slice(1), problems)
  if (problems.length > 0) throw new ConfgenError(problems)

  return {
    runtimes: inRegistryOrder(RUNTIME_NAMES, runtimes),
    presets: inRegistryOrder(PRESET_NAMES, presets),
  }
}

function selectedRuntimes(
  tokens: readonly string[],
  problems: string[]
): RuntimeName[] {
  const selected: RuntimeName[] = []
  const seen = new Set<string>()
  const reportedDuplicates = new Set<string>()

  for (const token of tokens) {
    const name = runtimeTokenName(token)
    if (name === undefined) {
      problems.push(`Invalid runtime "${token}". Expected #name.`)
      continue
    }
    if (seen.has(name)) {
      if (!reportedDuplicates.has(name)) {
        problems.push(`Duplicate runtime "${name}".`)
        reportedDuplicates.add(name)
      }
      continue
    }
    seen.add(name)
    if (!isRuntimeName(name)) {
      problems.push(`Unknown runtime "${name}".`)
      continue
    }
    selected.push(name)
  }

  return selected
}

function selectedPresets(
  tokens: readonly string[],
  problems: string[]
): PresetName[] {
  const selected: PresetName[] = []
  const seen = new Set<string>()
  const reportedDuplicates = new Set<string>()

  for (const token of tokens) {
    if (seen.has(token)) {
      if (!reportedDuplicates.has(token)) {
        problems.push(`Duplicate preset "${token}".`)
        reportedDuplicates.add(token)
      }
      continue
    }
    seen.add(token)
    if (!isPresetName(token)) {
      problems.push(`Unknown preset "${token}".`)
      continue
    }
    selected.push(token)
  }

  return selected
}

function runtimeTokenName(token: string): string | undefined {
  if (!token.startsWith("#") || token.length < 2) return undefined
  return token.slice(1)
}

function inRegistryOrder<Name extends string>(
  registry: readonly Name[],
  selected: readonly Name[]
): Name[] {
  return registry.filter((name) => selected.includes(name))
}
