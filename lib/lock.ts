import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type {
  Contribution,
  ContributionSource,
  JsonValue,
  StructuredAddress,
  ViteConfigItem,
} from "./contributions.js"
import { ConfgenError } from "./errors.js"
import { isPresetName, type PresetName } from "./presets/registry.js"
import { isRuntimeName, type RuntimeName } from "./runtimes.js"
import type { Selection } from "./selection.js"
import { isMissingFile, type System } from "./system.js"
import { z } from "zod"

/** Committed reconciliation evidence. Applications do not read this file. */
export const LOCK_PATH = "confgen.lock"

/** Temporary lock written beside the real lock and renamed into place. */
export const LOCK_TEMPORARY_PATH = "confgen.lock.tmp"

export const SUPPORTED_LOCK_VERSION = 1

const sourceSchema = z.string().refine(isContributionSource, {
  message: "Expected a runtime:* or preset:* source",
})

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

const addressSchema = z.array(
  z.union([z.string().min(1), z.number().int().nonnegative()])
)

const viteImportSchema = z.object({
  id: z.string().min(1),
  source: sourceSchema,
  kind: z.literal("import"),
  module: z.string().min(1),
  imported: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("default") }),
    z.object({ kind: z.literal("named"), name: z.string().min(1) }),
  ]),
  preferredLocal: z.string().min(1),
})

const vitePluginSchema = z.object({
  id: z.string().min(1),
  source: sourceSchema,
  kind: z.literal("plugin"),
  importId: z.string().min(1),
  arguments: z.array(z.string()),
})

const vitePropertySchema = z.object({
  id: z.string().min(1),
  source: sourceSchema,
  kind: z.literal("property"),
  path: z.array(z.string().min(1)).min(1),
  value: z.string(),
})

const lockContributionSchema = z.discriminatedUnion("strategy", [
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("whole-file"),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("starter-file"),
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("structured"),
    format: z.enum(["json", "yaml"]),
    address: addressSchema,
    value: jsonValueSchema,
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("line"),
    value: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("dependency"),
    section: z.enum(["dependencies", "devDependencies", "peerDependencies"]),
    package: z.string().min(1),
    range: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("package-script"),
    name: z.string().min(1),
    command: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    source: sourceSchema,
    path: z.string().min(1),
    strategy: z.literal("vite-config"),
    items: z.array(
      z.discriminatedUnion("kind", [
        viteImportSchema,
        vitePluginSchema,
        vitePropertySchema,
      ])
    ),
  }),
])

const lockSchema = z.object({
  lockVersion: z.literal(SUPPORTED_LOCK_VERSION),
  confgenVersion: z.string().min(1),
  runtimes: z.array(z.string().refine(isRuntimeName)),
  presets: z.array(z.string().refine(isPresetName)),
  contributions: z.array(lockContributionSchema),
})

export type LockContribution = z.infer<typeof lockContributionSchema>
export type LockData = z.infer<typeof lockSchema>

const ownPackageSchema = z
  .object({
    version: z.string().min(1),
  })
  .loose()

let ownVersion: string | undefined

/** Version of this Confgen package, recorded in the lock. */
export function confgenVersion(): string {
  if (ownVersion !== undefined) return ownVersion
  const path = fileURLToPath(new URL("../package.json", import.meta.url))
  const parsed = ownPackageSchema.safeParse(
    jsonUnknown(JSON.parse(readFileSync(path, "utf8")))
  )
  if (!parsed.success) {
    throw new Error("confgen package.json has no version")
  }
  ownVersion = parsed.data.version
  return ownVersion
}

/** SHA-256 of the exact file text, used to recognize generated whole files. */
export function textHash(contents: string): string {
  return createHash("sha256").update(contents).digest("hex")
}

/**
 * Evidence for a successful run. Whole files store a content hash, starter
 * files store identity only, and in-file strategies store the normalized value
 * needed to recognize a later update or removal.
 */
export function lockFromContributions(input: {
  selection: Selection
  contributions: readonly Contribution[]
}): LockData {
  const contributions = input.contributions
    .map(lockContribution)
    .sort(compareLockContributions)
  return {
    lockVersion: SUPPORTED_LOCK_VERSION,
    confgenVersion: confgenVersion(),
    runtimes: [...input.selection.runtimes],
    presets: [...input.selection.presets],
    contributions,
  }
}

/** Stable JSON text for `confgen.lock`. */
export function serializeLock(lock: LockData): string {
  return `${JSON.stringify(orderedLock(lock), null, 2)}\n`
}

/**
 * Reads `confgen.lock`. A missing file is an adoption run. An unsupported
 * version fails with a migration diagnostic.
 */
export async function readLock(system: System): Promise<LockData | undefined> {
  let text: string
  try {
    text = await system.readFile(LOCK_PATH)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    const message = error instanceof Error ? error.message : String(error)
    throw new ConfgenError([`${LOCK_PATH}: could not read file (${message})`])
  }
  return parseLock(text)
}

export function parseLock(text: string): LockData {
  let source: unknown
  try {
    source = jsonUnknown(JSON.parse(text))
  } catch {
    throw new ConfgenError([`${LOCK_PATH}: invalid JSON`])
  }
  if (!isRecord(source)) {
    throw new ConfgenError([`${LOCK_PATH}: expected an object`])
  }
  const version = source.lockVersion
  if (typeof version !== "number") {
    throw new ConfgenError([`${LOCK_PATH}: lockVersion: expected a number`])
  }
  if (version !== SUPPORTED_LOCK_VERSION) {
    throw new ConfgenError([
      `${LOCK_PATH}: lock version ${version} is not supported. This Confgen supports lock version ${SUPPORTED_LOCK_VERSION}.`,
    ])
  }
  const parsed = lockSchema.safeParse(source)
  if (!parsed.success) {
    throw new ConfgenError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.map(String).join(".")
        const location = path.length === 0 ? LOCK_PATH : `${LOCK_PATH}: ${path}`
        return `${location}: ${issue.message}`
      })
    )
  }
  return parsed.data
}

/**
 * Replaces `confgen.lock` only after the caller has finished application and
 * verification. Identical text is left in place.
 */
export async function writeLockFile(
  system: System,
  lock: LockData
): Promise<void> {
  const next = serializeLock(lock)
  const current = await readOptional(system, LOCK_PATH)
  if (current === next) return
  await system.writeFile(LOCK_TEMPORARY_PATH, next)
  await system.rename(LOCK_TEMPORARY_PATH, LOCK_PATH)
}

export function viteItemsFromLock(
  items: ReadonlyArray<
    Extract<LockContribution, { strategy: "vite-config" }>["items"][number]
  >
): ViteConfigItem[] {
  return items.map(viteItemFromLock)
}

function lockContribution(contribution: Contribution): LockContribution {
  switch (contribution.kind) {
    case "whole-file":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.path,
        strategy: "whole-file",
        hash: textHash(contribution.contents),
      }
    case "starter-file":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.path,
        strategy: "starter-file",
      }
    case "structured":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.path,
        strategy: "structured",
        format: contribution.format,
        address: [...contribution.address],
        value: contribution.value,
      }
    case "line":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.path,
        strategy: "line",
        value: contribution.value,
      }
    case "dependency":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.manifest,
        strategy: "dependency",
        section: contribution.section,
        package: contribution.package,
        range: contribution.range,
      }
    case "package-script":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.manifest,
        strategy: "package-script",
        name: contribution.name,
        command: contribution.command,
      }
    case "vite-config":
      return {
        id: contribution.id,
        source: contribution.source,
        path: contribution.path,
        strategy: "vite-config",
        items: contribution.items.map(lockViteItem).sort(compareIds),
      }
    default:
      return assertNever(contribution)
  }
}

function lockViteItem(item: ViteConfigItem): LockViteItem {
  if (item.kind === "import") {
    if (item.imported.kind === "default") {
      return {
        id: item.id,
        source: item.source,
        kind: "import",
        module: item.module,
        imported: { kind: "default" },
        preferredLocal: item.preferredLocal,
      }
    }
    return {
      id: item.id,
      source: item.source,
      kind: "import",
      module: item.module,
      imported: { kind: "named", name: item.imported.name },
      preferredLocal: item.preferredLocal,
    }
  }
  if (item.kind === "plugin") {
    return {
      id: item.id,
      source: item.source,
      kind: "plugin",
      importId: item.importId,
      arguments: [...item.arguments],
    }
  }
  return {
    id: item.id,
    source: item.source,
    kind: "property",
    path: [...item.path],
    value: item.value,
  }
}

type LockViteItem = Extract<
  LockContribution,
  { strategy: "vite-config" }
>["items"][number]

function viteItemFromLock(item: LockViteItem): ViteConfigItem {
  return lockViteItem(item)
}

function orderedLock(lock: LockData): LockData {
  return {
    lockVersion: lock.lockVersion,
    confgenVersion: lock.confgenVersion,
    runtimes: [...lock.runtimes],
    presets: [...lock.presets],
    contributions: lock.contributions
      .slice()
      .sort(compareLockContributions)
      .map(orderedContribution),
  }
}

function orderedContribution(contribution: LockContribution): LockContribution {
  if (contribution.strategy !== "vite-config") return contribution
  return {
    ...contribution,
    items: contribution.items.slice().sort(compareIds),
  }
}

function compareLockContributions(
  left: LockContribution,
  right: LockContribution
): number {
  return compareText(left.id, right.id)
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return compareText(left.id, right.id)
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isContributionSource(value: string): value is ContributionSource {
  if (value.startsWith("runtime:")) {
    return isRuntimeName(value.slice("runtime:".length))
  }
  if (value.startsWith("preset:")) {
    return isPresetName(value.slice("preset:".length))
  }
  return false
}

async function readOptional(
  system: System,
  path: string
): Promise<string | undefined> {
  try {
    return await system.readFile(path)
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
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

export type { PresetName, RuntimeName, StructuredAddress }
