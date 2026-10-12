import { ConfgenError } from "./errors.js"
import type { ProjectFacts } from "./facts.js"
import { packageManifestContributions } from "./packageManifest.js"
import { presetContributions } from "./presets/index.js"
import {
  isPresetName,
  PRESET_NAMES,
  type PresetName,
} from "./presets/registry.js"
import {
  isRuntimeName,
  RUNTIME_NAMES,
  runtimeContributions,
  type RuntimeName,
} from "./runtimes.js"
import type { Selection } from "./selection.js"

export type ContributionSource =
  | `runtime:${RuntimeName}`
  | `preset:${PresetName}`

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type StructuredAddress = readonly (string | number)[]

type ContributionBase = {
  id: string
  source: ContributionSource
}

export type ViteConfigItem = {
  id: string
  source: ContributionSource
} & (
  | {
      kind: "import"
      module: string
      imported: { kind: "default" } | { kind: "named"; name: string }
      preferredLocal: string
    }
  | {
      kind: "plugin"
      importId: string
      arguments: readonly string[]
    }
  | {
      kind: "property"
      path: readonly string[]
      value: string
    }
)

export type Contribution =
  | (ContributionBase & {
      kind: "whole-file"
      path: string
      contents: string
    })
  | (ContributionBase & {
      kind: "starter-file"
      path: string
      contents: string
    })
  | (ContributionBase & {
      kind: "structured"
      path: string
      format: "json" | "yaml"
      address: StructuredAddress
      value: JsonValue
      update: "merge" | "replace"
    })
  | (ContributionBase & {
      kind: "line"
      path: string
      value: string
    })
  | (ContributionBase & {
      kind: "vite-config"
      path: string
      items: readonly ViteConfigItem[]
    })
  | (ContributionBase & {
      kind: "dependency"
      manifest: string
      section: "dependencies" | "devDependencies" | "peerDependencies"
      package: string
      range: string
    })
  | (ContributionBase & {
      kind: "package-script"
      manifest: string
      name: string
      command: string
    })

export type ProduceContributions = (
  selection: Selection,
  facts: ProjectFacts
) => readonly Contribution[]

/**
 * Collects runtime producers in registry order, then preset producers in
 * registry order, then package-manifest scripts, and normalizes the list.
 */
export function collectContributions(
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const collected: Contribution[] = []
  for (const runtime of selection.runtimes) {
    collected.push(...runtimeContributions(runtime, selection, facts))
  }
  for (const preset of selection.presets) {
    collected.push(...presetContributions(preset, selection, facts))
  }
  collected.push(...packageManifestContributions(selection, facts))
  return normalizeContributions(collected)
}

/**
 * Sorts by the canonical registries, aggregates Vite configs and identical
 * dependency or script declarations, and rejects duplicate identities and
 * incompatible overlaps.
 */
export function normalizeContributions(
  contributions: readonly Contribution[]
): Contribution[] {
  const sorted = contributions.slice().sort(compareContributions)
  const problems = [...duplicateIdProblems(sorted)]
  const aggregated = aggregate(sorted, problems)
  problems.push(
    ...duplicateIdProblems(aggregated),
    ...exclusivePathProblems(aggregated),
    ...structuredProblems(aggregated),
    ...viteItemProblems(aggregated)
  )
  const uniqueProblems = unique(problems)
  if (uniqueProblems.length > 0) throw new ConfgenError(uniqueProblems)
  return aggregated.slice().sort(compareContributions)
}

function aggregate(
  contributions: readonly Contribution[],
  problems: string[]
): Contribution[] {
  const result: Contribution[] = []
  const dependencyIndex = new Map<string, number>()
  const scriptIndex = new Map<string, number>()
  const viteIndex = new Map<string, number>()

  for (const contribution of contributions) {
    if (contribution.kind === "dependency") {
      const key = `${contribution.manifest}\0${contribution.section}\0${contribution.package}`
      const existingIndex = dependencyIndex.get(key)
      if (existingIndex === undefined) {
        dependencyIndex.set(key, result.length)
        result.push(contribution)
        continue
      }
      const existing = result[existingIndex]
      if (
        existing !== undefined &&
        existing.kind === "dependency" &&
        existing.range !== contribution.range
      ) {
        problems.push(
          `Dependency "${contribution.package}" in ${contribution.manifest} ${contribution.section} has ranges "${existing.range}" and "${contribution.range}".`
        )
      }
      continue
    }

    if (contribution.kind === "package-script") {
      const key = `${contribution.manifest}\0${contribution.name}`
      const existingIndex = scriptIndex.get(key)
      if (existingIndex === undefined) {
        scriptIndex.set(key, result.length)
        result.push(contribution)
        continue
      }
      const existing = result[existingIndex]
      if (
        existing !== undefined &&
        existing.kind === "package-script" &&
        existing.command !== contribution.command
      ) {
        problems.push(
          `Package script "${contribution.name}" in ${contribution.manifest} has commands "${existing.command}" and "${contribution.command}".`
        )
      }
      continue
    }

    if (contribution.kind === "vite-config") {
      const existingIndex = viteIndex.get(contribution.path)
      if (existingIndex === undefined) {
        viteIndex.set(contribution.path, result.length)
        result.push(contribution)
        continue
      }
      const existing = result[existingIndex]
      if (existing !== undefined && existing.kind === "vite-config") {
        result[existingIndex] = {
          id: `vite-config:${contribution.path}`,
          source: "preset:vite",
          kind: "vite-config",
          path: contribution.path,
          items: [...existing.items, ...contribution.items],
        }
      }
      continue
    }

    result.push(contribution)
  }

  return result
}

function duplicateIdProblems(contributions: readonly Contribution[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const reported = new Set<string>()
  for (const contribution of contributions) {
    if (!seen.has(contribution.id)) {
      seen.add(contribution.id)
      continue
    }
    if (reported.has(contribution.id)) continue
    reported.add(contribution.id)
    problems.push(`Duplicate contribution "${contribution.id}".`)
  }
  return problems
}

function exclusivePathProblems(
  contributions: readonly Contribution[]
): string[] {
  const problems: string[] = []
  for (const group of groupsByPath(contributions)) {
    for (
      let leftIndex = 0;
      leftIndex < group.contributions.length;
      leftIndex += 1
    ) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < group.contributions.length;
        rightIndex += 1
      ) {
        const left = group.contributions[leftIndex]
        const right = group.contributions[rightIndex]
        if (left === undefined || right === undefined) continue
        if (!isExclusive(left) && !isExclusive(right)) continue
        problems.push(
          `${left.kind} and ${right.kind} cannot share "${group.path}".`
        )
      }
    }
  }
  return problems
}

function structuredProblems(contributions: readonly Contribution[]): string[] {
  const problems: string[] = []
  for (const group of groupsByPath(contributions)) {
    const structured = group.contributions.filter(
      (contribution) => contribution.kind === "structured"
    )
    for (let leftIndex = 0; leftIndex < structured.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < structured.length;
        rightIndex += 1
      ) {
        const left = structured[leftIndex]
        const right = structured[rightIndex]
        if (left === undefined || right === undefined) continue
        if (left.kind !== "structured" || right.kind !== "structured") continue
        if (left.format !== right.format) {
          problems.push(
            `Structured formats differ in "${group.path}": ${left.format} and ${right.format}.`
          )
        }
        if (addressesOverlap(left.address, right.address)) {
          problems.push(
            `Structured addresses overlap in "${group.path}": ${formatAddress(
              left.address
            )} and ${formatAddress(right.address)}.`
          )
        }
      }
    }
  }
  return problems
}

function viteItemProblems(contributions: readonly Contribution[]): string[] {
  const problems: string[] = []
  for (const contribution of contributions) {
    if (contribution.kind !== "vite-config") continue
    const seen = new Set<string>()
    const reported = new Set<string>()
    for (const item of contribution.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        continue
      }
      if (reported.has(item.id)) continue
      reported.add(item.id)
      problems.push(
        `Duplicate Vite configuration item "${item.id}" in ${contribution.path}.`
      )
    }
  }
  return problems
}

function groupsByPath(
  contributions: readonly Contribution[]
): { path: string; contributions: Contribution[] }[] {
  const groups = new Map<string, Contribution[]>()
  for (const contribution of contributions) {
    const path = targetPath(contribution)
    const group = groups.get(path)
    if (group === undefined) groups.set(path, [contribution])
    else group.push(contribution)
  }
  return [...groups.keys()].sort(compareText).flatMap((path) => {
    const group = groups.get(path)
    return group === undefined ? [] : [{ path, contributions: group }]
  })
}

function targetPath(contribution: Contribution): string {
  switch (contribution.kind) {
    case "dependency":
    case "package-script":
      return contribution.manifest
    case "whole-file":
    case "starter-file":
    case "structured":
    case "line":
    case "vite-config":
      return contribution.path
    default:
      return assertNever(contribution)
  }
}

function isExclusive(contribution: Contribution): boolean {
  return (
    contribution.kind === "whole-file" || contribution.kind === "starter-file"
  )
}

function addressesOverlap(
  left: StructuredAddress,
  right: StructuredAddress
): boolean {
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  for (let index = 0; index < shorter.length; index += 1) {
    if (shorter[index] !== longer[index]) return false
  }
  return true
}

function formatAddress(address: StructuredAddress): string {
  let text = ""
  for (const segment of address) {
    if (typeof segment === "number") {
      text += `[${segment}]`
      continue
    }
    text = text.length === 0 ? segment : `${text}.${segment}`
  }
  return text.length === 0 ? "(root)" : text
}

function compareContributions(left: Contribution, right: Contribution): number {
  const sourceDelta = sourceRank(left.source) - sourceRank(right.source)
  if (sourceDelta !== 0) return sourceDelta
  return compareText(left.id, right.id)
}

function sourceRank(source: ContributionSource): number {
  if (source.startsWith("runtime:")) {
    const name = source.slice("runtime:".length)
    if (!isRuntimeName(name))
      throw new Error(`Unknown runtime source ${source}`)
    const index = RUNTIME_NAMES.indexOf(name)
    if (index < 0) throw new Error(`Unknown runtime source ${source}`)
    return index
  }
  const name = source.slice("preset:".length)
  if (!isPresetName(name)) throw new Error(`Unknown preset source ${source}`)
  const index = PRESET_NAMES.indexOf(name)
  if (index < 0) throw new Error(`Unknown preset source ${source}`)
  return RUNTIME_NAMES.length + index
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function unique(problems: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const problem of problems) {
    if (seen.has(problem)) continue
    seen.add(problem)
    result.push(problem)
  }
  return result
}

function assertNever(value: never): never {
  throw new Error(`Unexpected contribution ${JSON.stringify(value)}`)
}
