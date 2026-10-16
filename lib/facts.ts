import { ConfgenError } from "./errors.js"
import type { System } from "./system.js"
import { z } from "zod"

export type RepositoryFacts = {
  type: string
  url: string
}

export type PackageManifestFacts = {
  path: string
  name: string
  type?: string
  version?: string
  repository?: RepositoryFacts
  workspaces: readonly string[]
  dependencies: readonly string[]
  dependencyRanges?: Readonly<
    Record<
      "dependencies" | "devDependencies" | "peerDependencies",
      Readonly<Record<string, string>>
    >
  >
  registry?: string
}

export type ProjectFacts = {
  root: PackageManifestFacts
  packages: readonly PackageManifestFacts[]
  integrationWorkflowPath?:
    | ".github/workflows/integration-tests.yml"
    | ".github/workflows/integration-tests.yaml"
  publishGitHubRelease?: boolean
  publishClientPackage?: boolean
}

const RepositoryObjectSchema = z
  .object({
    type: z.string().min(1),
    url: z.string().min(1),
  })
  .loose()

const WorkspaceListSchema = z.array(z.string().min(1))

const WorkspacesSchema = z.union([
  WorkspaceListSchema,
  z.object({ packages: WorkspaceListSchema }).loose(),
])

const ManifestSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    repository: z.union([z.string().min(1), RepositoryObjectSchema]).optional(),
    workspaces: WorkspacesSchema.optional(),
    publishConfig: z
      .object({
        registry: z.string().min(1).optional(),
      })
      .loose()
      .optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
  })
  .loose()

type Manifest = z.infer<typeof ManifestSchema>

/**
 * Reads project identity, package names, workspaces, repository metadata,
 * and registry settings from the package manifests that own them.
 */
export async function readProjectFacts(system: System): Promise<ProjectFacts> {
  const root = await readManifest(system, "package.json")
  const problems = [...root.problems]
  const packages: PackageManifestFacts[] = []
  if (root.facts !== undefined) packages.push(root.facts)

  const workspaces = workspaceList(root.source)
  if (workspaces !== undefined) {
    const pathProblems = workspaces.flatMap((entry, index) => {
      const problem = workspacePathProblem(entry, index)
      return problem === undefined ? [] : [problem]
    })
    problems.push(...pathProblems)
    if (pathProblems.length === 0) {
      for (const entry of workspaces) {
        const child = await readManifest(system, `${entry}/package.json`)
        problems.push(...child.problems)
        if (child.facts !== undefined) packages.push(child.facts)
      }
    }
  }

  if (problems.length > 0) throw new ConfgenError(problems)
  const rootFacts = packages[0]
  if (rootFacts === undefined) {
    throw new ConfgenError(["package.json: file is missing"])
  }
  const integrationWorkflowPath = await existingIntegrationWorkflow(system)
  const artifactPolicy = await existingArtifactPolicy(system)
  return {
    root: rootFacts,
    packages,
    ...(integrationWorkflowPath === undefined
      ? {}
      : { integrationWorkflowPath }),
    ...(artifactPolicy === undefined ? {} : artifactPolicy),
  }
}

async function existingIntegrationWorkflow(
  system: System
): Promise<ProjectFacts["integrationWorkflowPath"]> {
  const integrationWorkflowPaths: readonly NonNullable<
    ProjectFacts["integrationWorkflowPath"]
  >[] = [
    ".github/workflows/integration-tests.yml",
    ".github/workflows/integration-tests.yaml",
  ]
  for (const path of integrationWorkflowPaths) {
    try {
      await system.readFile(path)
      return path
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
  }
  return undefined
}

async function existingArtifactPolicy(
  system: System
): Promise<
  | Pick<ProjectFacts, "publishClientPackage" | "publishGitHubRelease">
  | undefined
> {
  try {
    const workflow = await system.readFile(".github/workflows/artifacts.yml")
    return {
      publishGitHubRelease: workflow.includes("gh release create"),
      publishClientPackage: workflow.includes("working-directory: client"),
    }
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

type ManifestRead = {
  source: unknown
  facts?: PackageManifestFacts
  problems: string[]
}

async function readManifest(
  system: System,
  path: string
): Promise<ManifestRead> {
  let text: string
  try {
    text = await system.readFile(path)
  } catch (error) {
    if (isMissingFile(error)) {
      return { source: undefined, problems: [`${path}: file is missing`] }
    }
    const message = error instanceof Error ? error.message : String(error)
    return {
      source: undefined,
      problems: [`${path}: could not read file (${message})`],
    }
  }

  let source: unknown
  try {
    source = jsonUnknown(JSON.parse(text))
  } catch {
    return { source: undefined, problems: [`${path}: invalid JSON`] }
  }

  const parsed = ManifestSchema.safeParse(source)
  if (!parsed.success) {
    return {
      source,
      problems: describeIssues(path, parsed.error.issues),
    }
  }
  return { source, facts: manifestFacts(path, parsed.data), problems: [] }
}

function workspaceList(source: unknown): string[] | undefined {
  if (!isRecord(source) || !("workspaces" in source)) return []
  const parsed = WorkspacesSchema.safeParse(source.workspaces)
  if (!parsed.success) return undefined
  if (Array.isArray(parsed.data)) return [...parsed.data]
  return [...parsed.data.packages]
}

function workspacePathProblem(
  entry: string,
  index: number
): string | undefined {
  if (
    entry.includes("*") ||
    entry.includes("?") ||
    entry.includes("[") ||
    entry.includes("]")
  ) {
    return `package.json: workspaces[${index}]: workspace globs are not supported ("${entry}").`
  }
  if (entry.startsWith("/") || entry.split("/").includes("..")) {
    return `package.json: workspaces[${index}]: workspace path must be a relative directory inside the project.`
  }
  return undefined
}

function manifestFacts(path: string, manifest: Manifest): PackageManifestFacts {
  const facts: PackageManifestFacts = {
    path,
    name: manifest.name,
    workspaces: workspaceNames(manifest.workspaces),
    dependencies: [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ],
    dependencyRanges: {
      dependencies: manifest.dependencies ?? {},
      devDependencies: manifest.devDependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
    },
  }
  if (manifest.version !== undefined) facts.version = manifest.version
  if (manifest.type !== undefined) facts.type = manifest.type
  const repository = repositoryFacts(manifest.repository)
  if (repository !== undefined) facts.repository = repository
  const registry = manifest.publishConfig?.registry
  if (registry !== undefined) facts.registry = registry
  return facts
}

function workspaceNames(workspaces: Manifest["workspaces"]): string[] {
  if (workspaces === undefined) return []
  if (Array.isArray(workspaces)) return [...workspaces]
  return [...workspaces.packages]
}

function repositoryFacts(
  repository: Manifest["repository"]
): RepositoryFacts | undefined {
  if (repository === undefined) return undefined
  if (typeof repository === "string") return { type: "git", url: repository }
  return { type: repository.type, url: repository.url }
}

type ManifestIssue = z.core.$ZodIssue

/**
 * Turns Zod issues into file diagnostics. For a union, reports the branch
 * that matches the value closely enough to name a field.
 */
function describeIssues(
  file: string,
  issues: readonly ManifestIssue[]
): string[] {
  return issues.flatMap((issue) => describeIssue(file, issue, []))
}

function describeIssue(
  file: string,
  issue: ManifestIssue,
  prefix: readonly PropertyKey[]
): string[] {
  const path = [...prefix, ...issue.path]
  if (issue.code !== "invalid_union") {
    return [`${file}: ${fieldPath(path)}: ${issue.message}`]
  }

  const chosen = bestUnionBranches(issue.errors)
  if (chosen.length > 0) {
    return chosen.flatMap((branch) =>
      branch.flatMap((entry) => describeIssue(file, entry, path))
    )
  }
  return [`${file}: ${fieldPath(path)}: ${unionFallback(issue)}`]
}

function bestUnionBranches(
  branches: readonly (readonly ManifestIssue[])[]
): (readonly ManifestIssue[])[] {
  let bestScore = 0
  const scored = branches.map((branch) => {
    const score = unionBranchScore(branch)
    if (score > bestScore) bestScore = score
    return { branch, score }
  })
  if (bestScore === 0) return []
  return scored.flatMap((entry) =>
    entry.score === bestScore ? [entry.branch] : []
  )
}

function unionBranchScore(branch: readonly ManifestIssue[]): number {
  let score = 0
  for (const issue of branch) {
    if (issue.path.length > 0 || issue.code !== "invalid_type") score += 2
  }
  return score
}

function unionFallback(issue: ManifestIssue): string {
  if (issue.code !== "invalid_union") return issue.message
  const expected = new Set<string>()
  let received: string | undefined
  for (const branch of issue.errors) {
    for (const entry of branch) {
      if (entry.code !== "invalid_type" || entry.path.length > 0) continue
      expected.add(entry.expected)
      if (received === undefined) received = receivedType(entry.message)
    }
  }
  if (expected.size === 0) return issue.message
  const list = [...expected].join(" or ")
  if (received === undefined) return `Invalid input: expected ${list}`
  return `Invalid input: expected ${list}, received ${received}`
}

function receivedType(message: string): string | undefined {
  const marker = ", received "
  const index = message.lastIndexOf(marker)
  if (index < 0) return undefined
  const received = message.slice(index + marker.length)
  return received.length === 0 ? undefined : received
}

function fieldPath(path: readonly PropertyKey[]): string {
  let field = ""
  for (const segment of path) {
    if (typeof segment === "number") {
      field += `[${segment}]`
      continue
    }
    const text = String(segment)
    field = field.length === 0 ? text : `${field}.${text}`
  }
  return field.length === 0 ? "(root)" : field
}

function jsonUnknown(value: unknown): unknown {
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}
