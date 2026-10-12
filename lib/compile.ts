import {
  collectContributions,
  normalizeContributions,
  type Contribution,
} from "./contributions.js"
import { ConfgenError } from "./errors.js"
import { readProjectFacts, type ProjectFacts } from "./facts.js"
import { readLock, writeLockFile } from "./lock.js"
import { reconcile, type ChangeSet, type FileChange } from "./reconcile.js"
import { parseSelection, type Selection } from "./selection.js"
import { isMissingFile, type System } from "./system.js"

export type Compilation = {
  selection: Selection
  facts: ProjectFacts
  contributions: readonly Contribution[]
}

/**
 * Parses the selection, reads the manifest and lock, reconciles every
 * contribution, applies the change set, and replaces confgen.lock last.
 */
export async function compile(input: {
  selection: readonly string[]
  system: System
}): Promise<Compilation> {
  const selection = parseSelection(input.selection)
  const facts = await readProjectFacts(input.system)
  await readLock(input.system)
  const contributions = collectContributions(selection, facts)
  return compileCollected({
    selection,
    facts,
    contributions,
    system: input.system,
  })
}

/**
 * Runs reconciliation through lock replacement for contributions that have
 * already been collected.
 */
export async function compileCollected(input: {
  selection: Selection
  facts: ProjectFacts
  contributions: readonly Contribution[]
  system: System
}): Promise<Compilation> {
  const contributions = normalizeContributions(input.contributions)
  const prior = await readLock(input.system)
  const files = await readAffectedFiles(input.system, contributions, prior)
  const changeSet = reconcile({
    selection: input.selection,
    contributions,
    prior,
    files,
    yarnLockPresent: files.has("yarn.lock"),
    pnpPresent: files.has(".pnp.cjs"),
  })
  await applyChanges(input.system, changeSet.files)
  if (changeSet.runYarnInstall) {
    const result = await input.system.run("yarn", ["install"])
    if (result.status !== 0) {
      const detail =
        result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
      throw new ConfgenError([`yarn install failed: ${detail}`])
    }
  }
  await verifyApplied(input.system, changeSet)
  await writeLockFile(input.system, changeSet.lock)
  return {
    selection: input.selection,
    facts: input.facts,
    contributions,
  }
}

async function readAffectedFiles(
  system: System,
  contributions: readonly Contribution[],
  prior: Awaited<ReturnType<typeof readLock>>
): Promise<Map<string, string>> {
  const paths = new Set<string>([
    "package.json",
    "yarn.lock",
    ".pnp.cjs",
    ".yarnrc.yml",
    ".yarnrc",
  ])
  for (const contribution of contributions)
    paths.add(contributionPath(contribution))
  for (const contribution of prior?.contributions ?? [])
    paths.add(contribution.path)
  const files = new Map<string, string>()
  for (const path of paths) {
    const text = await readOptional(system, path)
    if (text !== undefined) files.set(path, text)
  }
  return files
}

async function applyChanges(
  system: System,
  changes: readonly FileChange[]
): Promise<void> {
  for (const change of changes) {
    if (change.type === "write") {
      await system.writeFile(change.path, change.contents)
      continue
    }
    await system.removeFile(change.path)
  }
}

async function verifyApplied(
  system: System,
  changeSet: ChangeSet
): Promise<void> {
  const problems: string[] = []
  for (const change of changeSet.files) {
    if (change.type === "remove") {
      const text = await readOptional(system, change.path)
      if (text !== undefined)
        problems.push(`${change.path}: file was not removed`)
      continue
    }
    const text = await readOptional(system, change.path)
    if (text === undefined) {
      problems.push(`${change.path}: file is missing after writing`)
      continue
    }
    if (text === change.contents) continue
    if (changeSet.runYarnInstall && change.path === "package.json") {
      problems.push(...packageJsonDrift(change.contents, text))
      continue
    }
    problems.push(`${change.path}: contents changed after they were written`)
  }
  for (const contribution of changeSet.desiredContributions) {
    if (contribution.kind !== "starter-file") continue
    const text = await readOptional(system, contribution.path)
    if (text === undefined) {
      problems.push(`${contribution.path}: starter file is missing`)
    }
  }
  if (problems.length > 0) throw new ConfgenError(problems)
}

function packageJsonDrift(expected: string, actual: string): string[] {
  const expectedValue = parseObject(expected)
  const actualValue = parseObject(actual)
  if (expectedValue === undefined || actualValue === undefined) {
    return ["package.json: verification could not parse the manifest"]
  }
  if (!sameSection(expectedValue, actualValue, "dependencies")) {
    return ["package.json: dependencies changed during yarn install"]
  }
  if (!sameSection(expectedValue, actualValue, "devDependencies")) {
    return ["package.json: devDependencies changed during yarn install"]
  }
  if (!sameSection(expectedValue, actualValue, "peerDependencies")) {
    return ["package.json: peerDependencies changed during yarn install"]
  }
  if (!sameSection(expectedValue, actualValue, "scripts")) {
    return ["package.json: scripts changed during yarn install"]
  }
  return []
}

function sameSection(
  expected: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
  section: string
): boolean {
  return (
    JSON.stringify(expected[section] ?? null) ===
    JSON.stringify(actual[section] ?? null)
  )
}

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)) return undefined
    return value
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function contributionPath(contribution: Contribution): string {
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

async function readOptional(
  system: System,
  path: string
): Promise<string | undefined> {
  try {
    return await system.readFile(path)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfgenError([`${path}: could not read file (${message})`])
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected contribution ${JSON.stringify(value)}`)
}
