import { ConfgenError } from "./errors"
import { isPresetName, PRESET_NAMES, type PresetName } from "./presets/registry"
import { isRuntimeName, RUNTIME_NAMES, type RuntimeName } from "./runtimes"

export const LIBRARY_PLATFORMS = ["node", "browser", "universal"] as const

export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number]

export type Selection = {
  runtimes: readonly RuntimeName[]
  presets: readonly PresetName[]
  /**
   * Platform for the `lib` runtime. Present only when that runtime is
   * selected. Node, browser, and universal are explicit and equally valid.
   */
  libraryPlatform?: LibraryPlatform
  /**
   * The project publishes `lib/test-kit.ts` at the `./test-kit` export.
   * Only valid with the Node library platform.
   */
  libraryTestKit?: true
}

const runtimeGroupPrefix = "runtimes="

const libraryPlatformList = formatList(LIBRARY_PLATFORMS)

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

  const selected = selectedRuntimes(runtimeTokens, problems)
  const presets = selectedPresets(args.slice(1), problems)
  if (problems.length > 0) throw new ConfgenError(problems)

  return {
    runtimes: inRegistryOrder(RUNTIME_NAMES, selected.runtimes),
    presets: inRegistryOrder(PRESET_NAMES, presets),
    ...(selected.libraryPlatform === undefined
      ? {}
      : { libraryPlatform: selected.libraryPlatform }),
    ...(selected.libraryTestKit === true ? { libraryTestKit: true } : {}),
  }
}

type PlatformState =
  | { kind: "none" }
  | { kind: "bare" }
  | { kind: "library"; platform: LibraryPlatform; testKit: boolean }

function selectedRuntimes(
  tokens: readonly string[],
  problems: string[],
): {
  runtimes: RuntimeName[]
  libraryPlatform?: LibraryPlatform
  libraryTestKit?: true
} {
  const selected: RuntimeName[] = []
  const seen = new Map<string, PlatformState>()
  const reportedDuplicates = new Set<string>()
  const reportedConflicts = new Set<string>()
  let libraryPlatform: LibraryPlatform | undefined
  let libraryTestKit: true | undefined

  for (const token of tokens) {
    const parsed = parseRuntimeToken(token)
    if (parsed.kind === "invalid") {
      problems.push(`Invalid runtime "${token}". Expected #name.`)
      continue
    }
    if (parsed.kind === "conflicting-modifiers") {
      problems.push(`Conflicting modifiers on "${token}".`)
      continue
    }
    if (!isRuntimeName(parsed.name)) {
      problems.push(`Unknown runtime "${parsed.name}".`)
      continue
    }
    const platform = platformFor(
      parsed.name,
      parsed.modifier,
      parsed.extra,
      token,
      problems,
    )
    if (platform.kind === "invalid") continue
    const previous = seen.get(parsed.name)
    if (previous !== undefined) {
      if (!samePlatform(previous, platform)) {
        if (!reportedConflicts.has(parsed.name)) {
          problems.push(`Conflicting modifiers for runtime "${parsed.name}".`)
          reportedConflicts.add(parsed.name)
        }
      } else if (!reportedDuplicates.has(parsed.name)) {
        problems.push(`Duplicate runtime "${parsed.name}".`)
        reportedDuplicates.add(parsed.name)
      }
      continue
    }
    seen.set(parsed.name, platform)
    if (platform.kind === "bare") continue
    selected.push(parsed.name)
    if (platform.kind === "library") {
      libraryPlatform = platform.platform
      if (platform.testKit) libraryTestKit = true
    }
  }

  return {
    runtimes: selected,
    ...(libraryPlatform === undefined ? {} : { libraryPlatform }),
    ...(libraryTestKit === undefined ? {} : { libraryTestKit }),
  }
}

function platformFor(
  name: RuntimeName,
  modifier: string | undefined,
  extra: string | undefined,
  token: string,
  problems: string[],
): PlatformState | { kind: "invalid" } {
  if (name !== "lib") {
    if (modifier === undefined && extra === undefined) return { kind: "none" }
    problems.push(`Runtime "${name}" does not accept a platform modifier.`)
    return { kind: "invalid" }
  }
  if (modifier === undefined) {
    problems.push(
      `Library runtime "${token}" requires a platform. Expected #lib:node, #lib:browser, or #lib:universal.`,
    )
    return { kind: "bare" }
  }
  if (!isLibraryPlatform(modifier)) {
    problems.push(
      `Unknown library platform "${modifier}". Expected ${libraryPlatformList}.`,
    )
    return { kind: "invalid" }
  }
  if (extra === undefined) {
    return { kind: "library", platform: modifier, testKit: false }
  }
  if (extra !== "test-kit") {
    problems.push(`Unknown library modifier "${extra}". Expected test-kit.`)
    return { kind: "invalid" }
  }
  if (modifier !== "node") {
    problems.push(
      `Library platform "${modifier}" cannot publish a test kit. Select #lib:node:test-kit.`,
    )
    return { kind: "invalid" }
  }
  return { kind: "library", platform: "node", testKit: true }
}

function samePlatform(left: PlatformState, right: PlatformState): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind !== "library" || right.kind !== "library") return true
  return left.platform === right.platform && left.testKit === right.testKit
}

function selectedPresets(
  tokens: readonly string[],
  problems: string[],
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

type ParsedRuntimeToken =
  | { kind: "invalid" }
  | { kind: "conflicting-modifiers" }
  | { kind: "runtime"; name: string; modifier?: string; extra?: string }

/**
 * Splits a runtime token into a name, a platform modifier, and one optional
 * library modifier. A missing `#` is invalid. More than two `:` segments
 * means conflicting modifiers.
 */
function parseRuntimeToken(token: string): ParsedRuntimeToken {
  if (!token.startsWith("#") || token.length < 2) return { kind: "invalid" }
  const body = token.slice(1)
  const parts = body.split(":")
  const name = parts[0]
  if (name === undefined || name.length === 0) return { kind: "invalid" }
  if (parts.length > 3) return { kind: "conflicting-modifiers" }
  const modifier = parts[1]
  const extra = parts[2]
  if (modifier === undefined) return { kind: "runtime", name }
  if (extra === undefined) return { kind: "runtime", name, modifier }
  return { kind: "runtime", name, modifier, extra }
}

/** True when the modifier is `node`, `browser`, or `universal`. */
function isLibraryPlatform(value: string): value is LibraryPlatform {
  for (const platform of LIBRARY_PLATFORMS) {
    if (platform === value) return true
  }
  return false
}

/** Formats a list for a diagnostic, such as "node, browser, or universal". */
function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  const last = items[items.length - 1] ?? ""
  return `${items.slice(0, -1).join(", ")}, or ${last}`
}

function inRegistryOrder<Name extends string>(
  registry: readonly Name[],
  selected: readonly Name[],
): Name[] {
  return registry.filter((name) => selected.includes(name))
}
