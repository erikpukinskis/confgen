import type {
  Contribution,
  JsonValue,
  StructuredAddress,
  ViteConfigItem,
} from "./contributions.js"
import { ConfgenError } from "./errors.js"
import {
  lockFromContributions,
  textHash,
  viteItemsFromLock,
  type LockContribution,
  type LockData,
} from "./lock.js"
import { reconcileViteConfig } from "./reconcileViteConfig.js"
import type { Selection } from "./selection.js"
import { parseDocument, isMap, isSeq } from "yaml"

export type FileChange =
  | { type: "write"; path: string; contents: string }
  | { type: "remove"; path: string }

export type ChangeSet = {
  files: readonly FileChange[]
  runYarnInstall: boolean
  desiredContributions: readonly Contribution[]
  lock: LockData
}

const YARN_CONFIG_PATHS = [".yarnrc.yml", ".yarnrc"]
const DEPENDENCY_SECTIONS: readonly (
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
)[] = ["dependencies", "devDependencies", "peerDependencies"]

/**
 * Builds the complete in-memory change set for selected contributions and
 * deselected lock entries. It does not write files.
 */
export function reconcile(input: {
  selection: Selection
  contributions: readonly Contribution[]
  prior: LockData | undefined
  files: ReadonlyMap<string, string>
  yarnLockPresent: boolean
  pnpPresent: boolean
}): ChangeSet {
  const problems: string[] = []
  const changes: FileChange[] = []
  const desiredIds = new Set(
    input.contributions.map((contribution) => contribution.id)
  )
  const priorByPath = groupPrior(input.prior)
  const desiredByPath = groupDesired(input.contributions)
  const paths = [
    ...new Set([...desiredByPath.keys(), ...priorByPath.keys()]),
  ].sort(compareText)

  for (const path of paths) {
    const result = reconcilePath({
      path,
      desired: desiredByPath.get(path) ?? emptyDesired(),
      prior: (priorByPath.get(path) ?? []).filter(
        (entry) => !desiredIds.has(entry.id)
      ),
      priorEntries: priorByPath.get(path) ?? [],
      current: input.files.get(path),
    })
    problems.push(...result.problems)
    changes.push(...result.changes)
  }

  if (problems.length > 0) throw new ConfgenError(unique(problems))

  const files = changes.slice().sort(compareChanges)
  const runYarnInstall = yarnInstallRequired({
    files,
    currentFiles: input.files,
    yarnLockPresent: input.yarnLockPresent,
    pnpPresent: input.pnpPresent,
  })
  return {
    files,
    runYarnInstall,
    desiredContributions: input.contributions,
    lock: lockFromContributions({
      selection: input.selection,
      contributions: input.contributions,
    }),
  }
}

type DesiredGroup = {
  whole?: Extract<Contribution, { kind: "whole-file" }>
  starter?: Extract<Contribution, { kind: "starter-file" }>
  structured: Extract<Contribution, { kind: "structured" }>[]
  lines: Extract<Contribution, { kind: "line" }>[]
  dependencies: Extract<Contribution, { kind: "dependency" }>[]
  scripts: Extract<Contribution, { kind: "package-script" }>[]
  vite?: Extract<Contribution, { kind: "vite-config" }>
}

function reconcilePath(input: {
  path: string
  desired: DesiredGroup
  prior: readonly LockContribution[]
  priorEntries: readonly LockContribution[]
  current: string | undefined
}): { changes: FileChange[]; problems: string[] } {
  const problems = strategyProblems(input.path, input.desired, input.prior)
  if (problems.length > 0) return { changes: [], problems }

  if (input.desired.whole !== undefined) {
    return writeIfChanged(
      input.path,
      input.current,
      input.desired.whole.contents
    )
  }
  if (input.desired.starter !== undefined) {
    if (input.current !== undefined) return { changes: [], problems: [] }
    return {
      changes: [
        {
          type: "write",
          path: input.path,
          contents: input.desired.starter.contents,
        },
      ],
      problems: [],
    }
  }
  if (
    input.desired.vite !== undefined ||
    priorStrategy(input.prior, "vite-config")
  ) {
    return reconcileVitePath(input)
  }

  const wholeRemoval = input.prior.find(
    (entry) => entry.strategy === "whole-file"
  )
  if (wholeRemoval !== undefined && wholeRemoval.strategy === "whole-file") {
    return removeWholeFile(input.path, input.current, wholeRemoval.hash)
  }
  if (input.prior.some((entry) => entry.strategy === "starter-file")) {
    return { changes: [], problems: [] }
  }

  if (
    input.desired.dependencies.length > 0 ||
    input.desired.scripts.length > 0 ||
    input.desired.structured.some((entry) => entry.format === "json") ||
    input.prior.some(
      (entry) =>
        entry.strategy === "dependency" ||
        entry.strategy === "package-script" ||
        (entry.strategy === "structured" && entry.format === "json")
    )
  ) {
    return reconcileJsonDocument(input)
  }

  if (
    input.desired.structured.some((entry) => entry.format === "yaml") ||
    input.prior.some(
      (entry) => entry.strategy === "structured" && entry.format === "yaml"
    )
  ) {
    return reconcileYamlDocument(input)
  }

  if (
    input.desired.lines.length > 0 ||
    priorStrategy(input.priorEntries, "line")
  ) {
    return reconcileLines(input)
  }

  return { changes: [], problems: [] }
}

function reconcileVitePath(input: {
  path: string
  desired: DesiredGroup
  priorEntries: readonly LockContribution[]
  current: string | undefined
}): { changes: FileChange[]; problems: string[] } {
  const prior = input.priorEntries.find(
    (entry) => entry.strategy === "vite-config"
  )
  const priorItems =
    prior !== undefined && prior.strategy === "vite-config"
      ? viteItemsFromLock(prior.items)
      : []
  const result = reconcileViteConfig({
    path: input.path,
    current: input.current,
    items: input.desired.vite?.items ?? [],
    priorItems,
  })
  if (result.problems.length > 0)
    return { changes: [], problems: [...result.problems] }
  if (result.contents === undefined) return { changes: [], problems: [] }
  return writeIfChanged(input.path, input.current, result.contents)
}

function removeWholeFile(
  path: string,
  current: string | undefined,
  hash: string
): { changes: FileChange[]; problems: string[] } {
  if (current === undefined) return { changes: [], problems: [] }
  if (textHash(current) !== hash) {
    return {
      changes: [],
      problems: [
        `Cannot remove changed whole file "${path}" because its contents no longer match confgen.lock.`,
      ],
    }
  }
  return { changes: [{ type: "remove", path }], problems: [] }
}

function reconcileJsonDocument(input: {
  path: string
  desired: DesiredGroup
  prior: readonly LockContribution[]
  current: string | undefined
}): { changes: FileChange[]; problems: string[] } {
  const problems: string[] = []
  for (const entry of input.desired.structured) {
    if (entry.format !== "json") {
      problems.push(
        `${input.path}: structured format ${entry.format} cannot share this JSON file.`
      )
    }
  }
  const overlap = manifestOverlapProblems(input.path, input.desired)
  problems.push(...overlap)
  if (problems.length > 0) return { changes: [], problems }

  let document: JsonValue
  if (input.current === undefined) {
    document = {}
  } else {
    const parsed = parseJson(input.path, input.current)
    if (typeof parsed === "string") return { changes: [], problems: [parsed] }
    document = parsed
  }

  for (const entry of input.desired.structured) {
    const updated = updateJson(
      document,
      entry.address,
      entry.value,
      entry.update,
      input.path
    )
    if (!updated.ok) return { changes: [], problems: [updated.problem] }
    document = updated.value
  }
  for (const entry of input.desired.dependencies) {
    const updated = updateJson(
      document,
      [entry.section, entry.package],
      entry.range,
      "replace",
      input.path
    )
    if (!updated.ok) return { changes: [], problems: [updated.problem] }
    document = updated.value
  }
  for (const entry of input.desired.scripts) {
    const updated = updateJson(
      document,
      ["scripts", entry.name],
      entry.command,
      "replace",
      input.path
    )
    if (!updated.ok) return { changes: [], problems: [updated.problem] }
    document = updated.value
  }

  let removed = document
  for (const entry of input.prior) {
    const next = removeJsonEntry(removed, entry, input.path)
    if (!next.ok) return { changes: [], problems: [next.problem] }
    removed = next.value
  }
  if (input.current === undefined && jsonEqual(removed, {})) {
    return { changes: [], problems: [] }
  }
  return writeJsonIfChanged(input.path, input.current, removed)
}

function reconcileYamlDocument(input: {
  path: string
  desired: DesiredGroup
  prior: readonly LockContribution[]
  current: string | undefined
}): { changes: FileChange[]; problems: string[] } {
  const problems: string[] = []
  for (const entry of input.desired.structured) {
    if (entry.format !== "yaml") {
      problems.push(
        `${input.path}: structured format ${entry.format} cannot share this YAML file.`
      )
    }
  }
  if (input.desired.lines.length > 0) {
    problems.push(`${input.path}: line entries cannot share a YAML file.`)
  }
  if (problems.length > 0) return { changes: [], problems }

  const text = input.current ?? ""
  const document = parseDocument(text)
  if (document.errors.length > 0) {
    return {
      changes: [],
      problems: document.errors.map(
        (error) => `${input.path}: ${error.message}`
      ),
    }
  }
  const before = jsonUnknown(document.toJS())

  for (const entry of input.desired.structured) {
    const problem = yamlWriteProblem(
      document,
      entry.address,
      entry.value,
      entry.update,
      input.path
    )
    if (problem !== undefined) return { changes: [], problems: [problem] }
  }
  for (const entry of input.prior) {
    if (entry.strategy !== "structured") continue
    const problem = yamlRemove(document, entry.address, input.path)
    if (problem !== undefined) return { changes: [], problems: [problem] }
  }

  const after = jsonUnknown(document.toJS())
  if (jsonEqual(before, after)) return { changes: [], problems: [] }
  const contents = ensureTrailingNewline(document.toString())
  return {
    changes: [{ type: "write", path: input.path, contents }],
    problems: [],
  }
}

function reconcileLines(input: {
  path: string
  desired: DesiredGroup
  priorEntries: readonly LockContribution[]
  current: string | undefined
}): { changes: FileChange[]; problems: string[] } {
  const current = splitLines(input.current ?? "")
  let lines = current.lines
  for (const entry of input.priorEntries) {
    if (entry.strategy !== "line") continue
    const replacement = input.desired.lines.find((line) => line.id === entry.id)
    if (replacement !== undefined && replacement.value === entry.value) continue
    if (
      input.desired.lines.some(
        (line) => line.value === entry.value && line.id !== entry.id
      )
    ) {
      continue
    }
    lines = removeFirst(lines, entry.value)
  }
  for (const entry of input.desired.lines) {
    if (!lines.includes(entry.value)) lines = [...lines, entry.value]
  }
  const contents = `${lines.join("\n")}${lines.length === 0 ? "" : "\n"}`
  const original = input.current ?? ""
  if (contents === original || (original.length === 0 && lines.length === 0)) {
    return { changes: [], problems: [] }
  }
  return {
    changes: [{ type: "write", path: input.path, contents }],
    problems: [],
  }
}

function strategyProblems(
  path: string,
  desired: DesiredGroup,
  prior: readonly LockContribution[]
): string[] {
  const problems: string[] = []
  const desiredKind = desiredKindName(desired)
  if (
    prior.some((entry) => entry.strategy === "starter-file") &&
    desiredKind !== undefined &&
    desiredKind !== "starter-file"
  ) {
    problems.push(`${path}: starter file cannot be rewritten.`)
  }
  if (
    prior.some((entry) => entry.strategy === "whole-file") &&
    desiredKind !== undefined &&
    desiredKind !== "whole-file"
  ) {
    problems.push(
      `${path}: cannot reconcile whole-file removal with ${desiredKind} edits.`
    )
  }
  if (
    desired.vite !== undefined &&
    (desired.structured.length > 0 || desired.lines.length > 0)
  ) {
    problems.push(
      `${path}: Vite configuration cannot share its file with another strategy.`
    )
  }
  if (
    desired.lines.length > 0 &&
    (desired.structured.length > 0 ||
      desired.dependencies.length > 0 ||
      desired.scripts.length > 0)
  ) {
    problems.push(
      `${path}: line entries cannot share this file with structured edits.`
    )
  }
  return problems
}

function manifestOverlapProblems(
  path: string,
  desired: DesiredGroup
): string[] {
  const problems: string[] = []
  const owned: { address: StructuredAddress; label: string }[] = []
  for (const entry of desired.dependencies) {
    owned.push({
      address: [entry.section, entry.package],
      label: `${entry.section}.${entry.package}`,
    })
  }
  for (const entry of desired.scripts) {
    owned.push({
      address: ["scripts", entry.name],
      label: `scripts.${entry.name}`,
    })
  }
  for (const entry of desired.structured) {
    for (const other of owned) {
      if (!addressesOverlap(entry.address, other.address)) continue
      problems.push(
        `${path}: structured address ${formatAddress(entry.address)} overlaps ${
          other.label
        }.`
      )
    }
  }
  return problems
}

function yarnInstallRequired(input: {
  files: readonly FileChange[]
  currentFiles: ReadonlyMap<string, string>
  yarnLockPresent: boolean
  pnpPresent: boolean
}): boolean {
  const packageWrite = input.files.find(
    (change) => change.type === "write" && change.path === "package.json"
  )
  const beforeText = input.currentFiles.get("package.json")
  const afterText =
    packageWrite !== undefined && packageWrite.type === "write"
      ? packageWrite.contents
      : beforeText
  const before =
    beforeText === undefined ? undefined : parseJsonValue(beforeText)
  const after = afterText === undefined ? undefined : parseJsonValue(afterText)
  const dependenciesChanged =
    packageWrite !== undefined &&
    !jsonEqual(dependencySnapshot(before), dependencySnapshot(after))
  const packageManagerChanged =
    packageWrite !== undefined &&
    !jsonEqual(packageManagerValue(before), packageManagerValue(after))
  const yarnConfigChanged = input.files.some(
    (change) =>
      YARN_CONFIG_PATHS.includes(change.path) ||
      YARN_CONFIG_PATHS.some((config) => change.path.endsWith(`/${config}`))
  )
  const usesYarn =
    hasDependencies(after ?? before) ||
    packageManagerIsYarn(after ?? before) ||
    YARN_CONFIG_PATHS.some((path) => {
      if (input.currentFiles.has(path)) return true
      return input.files.some(
        (change) => change.type === "write" && change.path === path
      )
    })
  const artifactsAbsent =
    usesYarn && (!input.yarnLockPresent || !input.pnpPresent)
  return (
    dependenciesChanged ||
    packageManagerChanged ||
    yarnConfigChanged ||
    artifactsAbsent
  )
}

function writeIfChanged(
  path: string,
  current: string | undefined,
  contents: string
): { changes: FileChange[]; problems: string[] } {
  if (current === contents) return { changes: [], problems: [] }
  return { changes: [{ type: "write", path, contents }], problems: [] }
}

function writeJsonIfChanged(
  path: string,
  current: string | undefined,
  value: JsonValue
): { changes: FileChange[]; problems: string[] } {
  if (current !== undefined) {
    const parsed = parseJsonValue(current)
    if (parsed !== undefined && jsonEqual(parsed, value)) {
      return { changes: [], problems: [] }
    }
  }
  return {
    changes: [{ type: "write", path, contents: formatJson(value, path) }],
    problems: [],
  }
}

type JsonResult =
  | { ok: true; value: JsonValue }
  | { ok: false; problem: string }

function updateJson(
  root: JsonValue,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace",
  path: string
): JsonResult {
  return writeAt(root, address, value, update, path, [])
}

function writeAt(
  current: JsonValue | undefined,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace",
  path: string,
  walked: StructuredAddress
): JsonResult {
  const head = address[0]
  if (head === undefined) {
    if (current === undefined || update === "replace")
      return { ok: true, value }
    return mergeValues(current, value, path, walked)
  }
  const rest = address.slice(1)
  if (typeof head === "number") {
    const list = current === undefined ? [] : current
    if (!isJsonArray(list)) {
      return {
        ok: false,
        problem: `${path}: cannot update ${formatAddress([
          ...walked,
          head,
        ])} because ${formatAddress(walked)} is not an array.`,
      }
    }
    const existing = list[head]
    const next = writeAt(existing, rest, value, update, path, [...walked, head])
    if (!next.ok) return next
    const copy = list.slice()
    copy[head] = next.value
    return { ok: true, value: copy }
  }
  const object = current === undefined ? {} : current
  if (!isJsonObject(object)) {
    return {
      ok: false,
      problem: `${path}: cannot update ${formatAddress([
        ...walked,
        head,
      ])} because ${formatAddress(walked)} is not an object.`,
    }
  }
  const existing = object[head]
  const next = writeAt(existing, rest, value, update, path, [...walked, head])
  if (!next.ok) return next
  return { ok: true, value: withKey(object, head, next.value) }
}

function mergeValues(
  current: JsonValue,
  value: JsonValue,
  path: string,
  walked: StructuredAddress
): JsonResult {
  if (isJsonObject(current) && isJsonObject(value)) {
    let merged: { readonly [key: string]: JsonValue } = current
    for (const key of Object.keys(value)) {
      const nextValue = value[key]
      if (nextValue === undefined) continue
      const existing = merged[key]
      if (
        existing !== undefined &&
        isJsonObject(existing) &&
        isJsonObject(nextValue)
      ) {
        const nested = mergeValues(existing, nextValue, path, [...walked, key])
        if (!nested.ok) return nested
        merged = withKey(merged, key, nested.value)
        continue
      }
      merged = withKey(merged, key, nextValue)
    }
    return { ok: true, value: merged }
  }
  if (Array.isArray(current) && Array.isArray(value)) {
    const merged = current.slice()
    for (const entry of value) {
      if (!merged.some((existing) => jsonEqual(existing, entry)))
        merged.push(entry)
    }
    return { ok: true, value: merged }
  }
  if (isContainer(current) && !sameContainer(current, value)) {
    return {
      ok: false,
      problem: `${path}: cannot merge ${formatAddress(
        walked
      )} without removing existing ${containerName(current)} content.`,
    }
  }
  return { ok: true, value }
}

function removeJsonEntry(
  root: JsonValue,
  entry: LockContribution,
  path: string
): JsonResult {
  if (entry.strategy === "structured")
    return deleteAt(root, entry.address, path)
  if (entry.strategy === "dependency") {
    return deleteEmptySection(
      deleteAt(root, [entry.section, entry.package], path),
      entry.section
    )
  }
  if (entry.strategy === "package-script") {
    return deleteEmptySection(
      deleteAt(root, ["scripts", entry.name], path),
      "scripts"
    )
  }
  return { ok: true, value: root }
}

function deleteEmptySection(result: JsonResult, section: string): JsonResult {
  if (!result.ok || !isJsonObject(result.value)) return result
  const container = result.value[section]
  if (!isJsonObject(container) || Object.keys(container).length > 0)
    return result
  return { ok: true, value: withKey(result.value, section, undefined) }
}

function deleteAt(
  current: JsonValue,
  address: StructuredAddress,
  path: string
): JsonResult {
  const head = address[0]
  if (head === undefined) return { ok: true, value: current }
  const rest = address.slice(1)
  if (typeof head === "number") {
    if (!isJsonArray(current)) return { ok: true, value: current }
    if (rest.length === 0) {
      if (current[head] === undefined) return { ok: true, value: current }
      return {
        ok: true,
        value: current.filter((_, index) => index !== head),
      }
    }
    const existing = current[head]
    if (existing === undefined) return { ok: true, value: current }
    const next = deleteAt(existing, rest, path)
    if (!next.ok) return next
    const copy = current.slice()
    copy[head] = next.value
    return { ok: true, value: copy }
  }
  if (!isJsonObject(current)) return { ok: true, value: current }
  const existing = current[head]
  if (existing === undefined) return { ok: true, value: current }
  if (rest.length === 0)
    return { ok: true, value: withKey(current, head, undefined) }
  if (!isJsonObject(existing) && !Array.isArray(existing)) {
    return {
      ok: false,
      problem: `${path}: cannot remove ${formatAddress(
        address
      )} because ${head} is not a container.`,
    }
  }
  const next = deleteAt(existing, rest, path)
  if (!next.ok) return next
  return { ok: true, value: withKey(current, head, next.value) }
}

function yamlWriteProblem(
  document: ReturnType<typeof parseDocument>,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace",
  path: string
): string | undefined {
  const blocked = yamlPathProblem(document, address, path)
  if (blocked !== undefined) return blocked
  if (update === "merge" && isJsonObject(value)) {
    const existing = unknownValue(document.getIn([...address]))
    if (isMap(existing)) {
      for (const key of Object.keys(value)) {
        const child = value[key]
        if (child === undefined) continue
        const problem = yamlWriteProblem(
          document,
          [...address, key],
          child,
          "merge",
          path
        )
        if (problem !== undefined) return problem
      }
      return undefined
    }
  }
  document.setIn([...address], jsonPlain(value))
  return undefined
}

function yamlRemove(
  document: ReturnType<typeof parseDocument>,
  address: StructuredAddress,
  path: string
): string | undefined {
  const parentAddress = address.slice(0, -1)
  const leaf = address[address.length - 1]
  if (leaf === undefined) return undefined
  const parent =
    parentAddress.length === 0
      ? unknownValue(document.contents)
      : unknownValue(document.getIn([...parentAddress], true))
  if (parent === undefined) return undefined
  if (typeof leaf === "number") {
    if (!isSeq(parent)) {
      return `${path}: cannot remove ${formatAddress(
        address
      )} because ${formatAddress(parentAddress)} is not an array.`
    }
  } else if (!isMap(parent)) {
    return `${path}: cannot remove ${formatAddress(
      address
    )} because ${formatAddress(parentAddress)} is not an object.`
  }
  document.deleteIn([...address])
  return undefined
}

function yamlPathProblem(
  document: ReturnType<typeof parseDocument>,
  address: StructuredAddress,
  path: string
): string | undefined {
  for (let index = 0; index < address.length - 1; index += 1) {
    const walked = address.slice(0, index + 1)
    const next = address[index + 1]
    const node = unknownValue(document.getIn([...walked], true))
    if (node === undefined) return undefined
    if (typeof next === "number") {
      if (!isSeq(node)) {
        return `${path}: cannot update ${formatAddress(
          address
        )} because ${formatAddress(walked)} is not an array.`
      }
      continue
    }
    if (!isMap(node)) {
      return `${path}: cannot update ${formatAddress(
        address
      )} because ${formatAddress(walked)} is not an object.`
    }
  }
  return undefined
}

function groupDesired(
  contributions: readonly Contribution[]
): Map<string, DesiredGroup> {
  const groups = new Map<string, DesiredGroup>()
  for (const contribution of contributions) {
    const path = contributionPath(contribution)
    const group = groups.get(path) ?? emptyDesired()
    switch (contribution.kind) {
      case "whole-file":
        group.whole = contribution
        break
      case "starter-file":
        group.starter = contribution
        break
      case "structured":
        group.structured.push(contribution)
        break
      case "line":
        group.lines.push(contribution)
        break
      case "dependency":
        group.dependencies.push(contribution)
        break
      case "package-script":
        group.scripts.push(contribution)
        break
      case "vite-config":
        group.vite = contribution
        break
      default:
        assertNever(contribution)
    }
    groups.set(path, group)
  }
  return groups
}

function groupPrior(
  lock: LockData | undefined
): Map<string, LockContribution[]> {
  const groups = new Map<string, LockContribution[]>()
  if (lock === undefined) return groups
  for (const contribution of lock.contributions) {
    const group = groups.get(contribution.path)
    if (group === undefined) groups.set(contribution.path, [contribution])
    else group.push(contribution)
  }
  return groups
}

function emptyDesired(): DesiredGroup {
  return { structured: [], lines: [], dependencies: [], scripts: [] }
}

function desiredKindName(desired: DesiredGroup): string | undefined {
  if (desired.whole !== undefined) return "whole-file"
  if (desired.starter !== undefined) return "starter-file"
  if (desired.vite !== undefined) return "vite-config"
  if (desired.structured.length > 0) return "structured"
  if (desired.lines.length > 0) return "line"
  if (desired.dependencies.length > 0 || desired.scripts.length > 0)
    return "package"
  return undefined
}

function priorStrategy(
  prior: readonly LockContribution[],
  strategy: LockContribution["strategy"]
): boolean {
  return prior.some((entry) => entry.strategy === strategy)
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

function dependencySnapshot(value: JsonValue | undefined): JsonValue {
  if (!isJsonObject(value)) return {}
  let snapshot: { readonly [key: string]: JsonValue } = {}
  for (const section of DEPENDENCY_SECTIONS) {
    const entries = value[section]
    if (entries !== undefined) snapshot = withKey(snapshot, section, entries)
  }
  return snapshot
}

function packageManagerValue(value: JsonValue | undefined): JsonValue {
  if (!isJsonObject(value)) return null
  return value.packageManager ?? null
}

function hasDependencies(value: JsonValue | undefined): boolean {
  if (!isJsonObject(value)) return false
  for (const section of DEPENDENCY_SECTIONS) {
    const entries = value[section]
    if (isJsonObject(entries) && Object.keys(entries).length > 0) return true
  }
  return false
}

function packageManagerIsYarn(value: JsonValue | undefined): boolean {
  if (!isJsonObject(value)) return false
  const manager = value.packageManager
  return typeof manager === "string" && manager.startsWith("yarn@")
}

function parseJson(path: string, text: string): JsonValue | string {
  const value = parseJsonValue(text)
  if (value === undefined) return `${path}: invalid JSON`
  return value
}

function parseJsonValue(text: string): JsonValue | undefined {
  try {
    const parsed = jsonValueSchema(jsonUnknown(JSON.parse(text)))
    return parsed
  } catch {
    return undefined
  }
}

function jsonValueSchema(value: unknown): JsonValue {
  if (value === null) return null
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map((entry) => jsonValueSchema(entry))
  if (isRecord(value)) {
    const object: { [key: string]: JsonValue } = {}
    for (const key of Object.keys(value)) {
      const entry = value[key]
      if (entry !== undefined) object[key] = jsonValueSchema(entry)
    }
    return object
  }
  throw new Error("JSON value is not a manifest value")
}

function jsonPlain(value: JsonValue): unknown {
  return jsonUnknown(JSON.parse(JSON.stringify(value)))
}

const JSON_PRINT_WIDTH = 80

function formatJson(value: JsonValue, path = ""): string {
  if (path.endsWith("package.json"))
    return `${JSON.stringify(value, null, 2)}\n`
  return `${printJson(value, 0, 0)}\n`
}

function printJson(value: JsonValue, column: number, indent: number): string {
  const flat = flatJson(value)
  if (column + flat.length <= JSON_PRINT_WIDTH) return flat
  if (isJsonArray(value)) return brokenArray(value, indent)
  if (isJsonObject(value)) return brokenObject(value, indent)
  return flat
}

function flatJson(value: JsonValue): string {
  if (isJsonArray(value)) {
    if (value.length === 0) return "[]"
    return `[${value.map((entry) => flatJson(entry)).join(", ")}]`
  }
  if (isJsonObject(value)) {
    const fields = Object.keys(value).flatMap((key) => {
      const entry = value[key]
      if (entry === undefined) return []
      return [`${JSON.stringify(key)}: ${flatJson(entry)}`]
    })
    if (fields.length === 0) return "{}"
    return `{ ${fields.join(", ")} }`
  }
  return JSON.stringify(value)
}

function brokenArray(value: readonly JsonValue[], indent: number): string {
  const pad = "  ".repeat(indent + 1)
  const closing = "  ".repeat(indent)
  const inner = value
    .map((entry) => `${pad}${printJson(entry, pad.length, indent + 1)}`)
    .join(",\n")
  return `[\n${inner}\n${closing}]`
}

function brokenObject(
  value: { readonly [key: string]: JsonValue },
  indent: number
): string {
  const pad = "  ".repeat(indent + 1)
  const closing = "  ".repeat(indent)
  const lines: string[] = []
  for (const key of Object.keys(value)) {
    const entry = value[key]
    if (entry === undefined) continue
    const prefix = `${pad}${JSON.stringify(key)}: `
    lines.push(`${prefix}${printJson(entry, prefix.length, indent + 1)}`)
  }
  if (lines.length === 0) return "{}"
  return `{\n${lines.join(",\n")}\n${closing}}`
}

function withKey(
  object: { readonly [key: string]: JsonValue },
  key: string,
  value: JsonValue | undefined
): { readonly [key: string]: JsonValue } {
  const next: { [key: string]: JsonValue } = {}
  let replaced = false
  for (const existing of Object.keys(object)) {
    if (existing === key) {
      replaced = true
      if (value !== undefined) next[existing] = value
      continue
    }
    const current = object[existing]
    if (current !== undefined) next[existing] = current
  }
  if (!replaced && value !== undefined) next[key] = value
  return next
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isJsonArray(
  value: JsonValue | undefined
): value is readonly JsonValue[] {
  return Array.isArray(value)
}

function isJsonObject(
  value: JsonValue | undefined
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isContainer(value: JsonValue): boolean {
  return Array.isArray(value) || isJsonObject(value)
}

function sameContainer(left: JsonValue, right: JsonValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
  }
  return isJsonObject(left) && isJsonObject(right)
}

function containerName(value: JsonValue): string {
  if (Array.isArray(value)) return "array"
  if (isJsonObject(value)) return "object"
  return "value"
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

function splitLines(text: string): { lines: string[] } {
  if (text.length === 0) return { lines: [] }
  const stripped = text.endsWith("\n") ? text.slice(0, -1) : text
  if (stripped.length === 0) return { lines: [] }
  return { lines: stripped.split("\n") }
}

function removeFirst(lines: readonly string[], value: string): string[] {
  const index = lines.indexOf(value)
  if (index < 0) return [...lines]
  return lines.filter((_, lineIndex) => lineIndex !== index)
}

function ensureTrailingNewline(text: string): string {
  if (text.endsWith("\n")) return text
  return `${text}\n`
}

function compareChanges(left: FileChange, right: FileChange): number {
  return compareText(left.path, right.path)
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

function unknownValue(value: unknown): unknown {
  return value
}

function jsonUnknown(value: unknown): unknown {
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertNever(value: never): never {
  throw new Error(`Unexpected contribution ${JSON.stringify(value)}`)
}

export type { ViteConfigItem }
