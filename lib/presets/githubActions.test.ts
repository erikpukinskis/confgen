import { collectContributions, type Contribution } from "../contributions.js"
import { ConfgenError } from "../errors.js"
import type { ProjectFacts } from "../facts.js"
import { reconcile, type FileChange } from "../reconcile.js"
import { parseSelection, type Selection } from "../selection.js"
import { expect, test } from "vitest"
import { parseDocument } from "yaml"

const registry = "https://npm.example.test"
const root = {
  path: "package.json",
  name: "@example/package-service",
  version: "0.1.0",
  repository: {
    type: "git",
    url: "https://github.com/example/package-service.git",
  },
  workspaces: ["client"],
  registry,
}
const client = {
  path: "client/package.json",
  name: "@example/package-service-client",
  version: "0.1.0",
  workspaces: [],
  registry,
}
const facts: ProjectFacts = { root, packages: [root, client] }
const packageJson = '{ "name": "@example/package-service" }\n'

const selection = parseSelection([
  "runtimes=#lib,#server,#client,#integration,#gateway",
  "yarn",
  "typescript",
  "vite",
  "vitest",
  "eslint",
  "prettier",
  "git",
  "graphql",
  "docker",
  "httpd",
  "githubActions",
  "githubPackage",
])

test("assembles deterministic jobs from the selected capabilities", () => {
  const first = workflowTexts(collectContributions(selection, facts))
  const second = workflowTexts(collectContributions(selection, facts))
  expect(second).toEqual(first)

  const checks = jobs(parseWorkflow(requiredText(first, checksPath)))
  expect(Object.keys(checks).sort()).toEqual([
    "build",
    "format",
    "lint",
    "test",
    "types",
  ])
  expect(taskCommands(requiredJob(checks, "format"))).toEqual([
    "yarn check:format",
  ])
  expect(taskCommands(requiredJob(checks, "lint"))).toEqual([
    "yarn build:generate",
    "yarn check:lint",
  ])
  expect(taskCommands(requiredJob(checks, "types"))).toEqual([
    "yarn build && yarn check:types",
  ])
  expect(taskCommands(requiredJob(checks, "test"))).toEqual([
    "yarn build:generate",
    "yarn test",
  ])
  expect(taskCommands(requiredJob(checks, "build"))).toEqual([
    'yarn build\necho "built=true" >> "$GITHUB_OUTPUT"\n',
    "yarn bump-n-pub check-pack",
  ])

  const integration = jobs(parseWorkflow(requiredText(first, integrationPath)))
  expect(commands(requiredJob(integration, "integration"))).toContain(
    "yarn dev-cluster certs"
  )
  expect(commands(requiredJob(integration, "integration"))).toContain(
    "yarn test:integration:ci"
  )

  const ci = ciJobsFor(selection)
  expect(Object.keys(ci).sort()).toEqual([
    "checks",
    "integration",
    "prepare",
    "publish-client",
    "publish-images",
    "publish-root",
    "registries",
    "release",
  ])
  expect(usesOf(requiredJob(ci, "checks"))).toBe(`./${checksPath}`)
  expect(usesOf(requiredJob(ci, "integration"))).toBe(`./${integrationPath}`)
})

test("ordinary checks use the standard runner and Docker jobs do not", () => {
  const texts = workflowTexts(collectContributions(selection, facts))
  const checks = jobs(parseWorkflow(requiredText(texts, checksPath)))
  for (const name of ["format", "lint", "types", "test", "build"]) {
    expect(runsOn(requiredJob(checks, name))).toBe("ubuntu-slim")
  }
  const integration = jobs(parseWorkflow(requiredText(texts, integrationPath)))
  expect(runsOn(requiredJob(integration, "integration"))).toBe("ubuntu-latest")
  const ci = ciJobsFor(selection)
  expect(runsOn(requiredJob(ci, "registries"))).toBe("ubuntu-slim")
  expect(runsOn(requiredJob(ci, "prepare"))).toBe("ubuntu-slim")
  expect(runsOn(requiredJob(ci, "publish-root"))).toBe("ubuntu-slim")
  expect(runsOn(requiredJob(ci, "publish-client"))).toBe("ubuntu-slim")
  expect(runsOn(requiredJob(ci, "release"))).toBe("ubuntu-slim")
  expect(runsOn(requiredJob(ci, "publish-images"))).toBe("ubuntu-latest")
})

test("publication waits on checks and explicit prepare outputs", () => {
  const texts = workflowTexts(collectContributions(selection, facts))
  const checks = jobs(parseWorkflow(requiredText(texts, checksPath)))
  const build = requiredJob(checks, "build")
  expect(objectField(build, "outputs").built).toBe(
    "${{ steps.build.outputs.built }}"
  )
  const call = objectField(
    objectField(parseWorkflow(requiredText(texts, checksPath)), "on"),
    "workflow_call"
  )
  expect(objectField(objectField(call, "outputs"), "built").value).toBe(
    "${{ jobs.build.outputs.built }}"
  )

  const ci = ciJobsFor(selection)
  const prepare = requiredJob(ci, "prepare")
  const outputs = objectField(prepare, "outputs")
  expect(outputs.package_version).toBe(
    "${{ steps.prepare.outputs.package_version }}"
  )
  expect(outputs.should_publish).toBe(
    "${{ steps.prepare.outputs.should_publish }}"
  )
  expect(commands(prepare).join("\n")).toContain(
    'yarn bump-n-pub prepare >> "$GITHUB_OUTPUT"'
  )
  expect(prepare.if).toBeUndefined()
  expect(requiredJob(ci, "registries").if).toBeUndefined()
  expect(commands(requiredJob(ci, "registries")).join("\n")).toContain(
    "yarn bump-n-pub check-registries"
  )

  const expectedNeeds = ["checks", "integration", "registries", "prepare"]
  expect(stringList(requiredJob(ci, "publish-root"), "needs")).toEqual(
    expectedNeeds
  )
  expect(stringList(requiredJob(ci, "publish-client"), "needs")).toEqual(
    expectedNeeds
  )
  expect(stringList(requiredJob(ci, "publish-images"), "needs")).toEqual(
    expectedNeeds
  )
  expect(stringList(requiredJob(ci, "release"), "needs")).toEqual([
    "prepare",
    "publish-root",
    "publish-client",
    "publish-images",
  ])
})

test("publishes through each manifest registry without another registry source", () => {
  const texts = workflowTexts(collectContributions(selection, facts))
  const combined = [...texts.values()].join("\n")
  expect(combined).not.toContain(registry)
  expect(combined).not.toContain("--registry")
  expect(combined).not.toContain("npmPublishRegistry")
  expect(combined).not.toContain("bump-n-pub major")
  expect(combined).not.toContain("bump-n-pub minor")
  expect(combined).not.toContain("bump-n-pub patch")
  expect(combined).not.toContain("bump-n-pub prerelease")

  const ci = ciJobsFor(selection)
  const publish =
    "yarn npm publish ${{ contains(needs.prepare.outputs.package_version, '-') && '--tag preview' || '' }}"
  expect(commands(requiredJob(ci, "publish-root")).join("\n")).toContain(
    publish
  )
  expect(commands(requiredJob(ci, "publish-client")).join("\n")).toContain(
    publish
  )
  expect(requiredJob(ci, "publish-root").if).toBe(
    "needs.prepare.outputs.should_publish == 'true'"
  )
  expect(requiredJob(ci, "publish-client").if).toBe(
    "needs.prepare.outputs.should_publish == 'true'"
  )
  const clientStep = steps(requiredJob(ci, "publish-client")).find(
    (step) => step["working-directory"] === "client"
  )
  expect(clientStep?.run).toContain(publish)
  const rootSteps = steps(requiredJob(ci, "publish-root"))
  expect(
    rootSteps.some((step) => step["working-directory"] !== undefined)
  ).toBe(false)

  const release = requiredJob(ci, "release")
  expect(release.if).toBe(
    "contains(fromJSON(vars.PUBLISHING_BRANCHES), github.ref_name) && needs.prepare.outputs.should_publish == 'true' && !contains(needs.prepare.outputs.package_version, '-')"
  )
  expect(commands(release).join("\n")).toContain(
    'gh release create "v${{ needs.prepare.outputs.package_version }}"'
  )
})

test("stamps published images with the prepare package version", () => {
  const images = requiredJob(ciJobsFor(selection), "publish-images")
  const tags = imageTags(images)
  expect(tags).toEqual([
    "ghcr.io/${{ github.repository_owner }}/package-api-server:${{ needs.prepare.outputs.package_version }}",
    "ghcr.io/${{ github.repository_owner }}/package-service:${{ needs.prepare.outputs.package_version }}",
  ])
  expect(imageTags(integrationJob())).toEqual([
    "package-api-server:${{ env.IMAGE_TAG }}",
    "package-service:${{ env.IMAGE_TAG }}",
    "package-service-integration-test-host:${{ env.IMAGE_TAG }}",
  ])
})

test("root and client publication follow the selected packages", () => {
  const withoutClient = ciJobsFor(
    parseSelection([
      "runtimes=#lib,#server",
      "vite",
      "docker",
      "githubActions",
      "githubPackage",
    ])
  )
  expect(withoutClient["publish-root"]).toBeDefined()
  expect(withoutClient["publish-client"]).toBeUndefined()
  expect(stringList(requiredJob(withoutClient, "release"), "needs")).toEqual([
    "prepare",
    "publish-root",
    "publish-images",
  ])

  const clientOnly = ciJobsFor(
    parseSelection([
      "runtimes=#client",
      "vite",
      "githubActions",
      "githubPackage",
    ])
  )
  expect(clientOnly["publish-root"]).toBeUndefined()
  expect(clientOnly["publish-client"]).toBeDefined()
  expect(clientOnly["publish-images"]).toBeUndefined()
  expect(stringList(requiredJob(clientOnly, "release"), "needs")).toEqual([
    "prepare",
    "publish-client",
  ])

  const checksOnly = workflowTexts(
    collectContributions(
      parseSelection(["runtimes=#lib", "prettier", "githubActions"]),
      facts
    )
  )
  expect([...checksOnly.keys()]).toEqual([checksPath])
  expect(jobs(parseWorkflow(requiredText(checksOnly, checksPath))).build).toBe(
    undefined
  )
})

test("replaces whole-file checks and preserves unrelated workflow jobs", () => {
  const created = reconcileSelection(selection)
  const checks = requiredText(workflowTextsFrom(created.files), checksPath)
  const withoutFormat = parseSelection([
    "runtimes=#lib,#server,#client,#integration,#gateway",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "eslint",
    "git",
    "graphql",
    "docker",
    "httpd",
    "githubActions",
    "githubPackage",
  ])
  const replaced = reconcile({
    selection: withoutFormat,
    contributions: collectContributions(withoutFormat, facts),
    prior: created.lock,
    files: workflowFiles(created.files, {
      [checksPath]: `${checks}# edited\n`,
    }),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const nextChecks = written(replaced.files, checksPath)
  expect(nextChecks).not.toContain("yarn check:format")
  expect(nextChecks).toContain("yarn check:lint")
  expect(nextChecks).not.toContain("# edited")

  const extended = reconcile({
    selection,
    contributions: collectContributions(selection, facts),
    prior: undefined,
    files: new Map([
      ["package.json", packageJson],
      [
        ciPath,
        "env:\n  CUSTOM: kept\njobs:\n  notify:\n    runs-on: ubuntu-slim\n    steps:\n      - run: echo kept\n  publish-root:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo stale\n",
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const ci = parseWorkflow(written(extended.files, ciPath))
  expect(objectField(ci, "env").CUSTOM).toBe("kept")
  const ciJobs = jobs(ci)
  expect(commands(requiredJob(ciJobs, "notify"))).toEqual(["echo kept"])
  expect(commands(requiredJob(ciJobs, "publish-root")).join("\n")).toContain(
    "yarn npm publish"
  )
  expect(
    commands(requiredJob(ciJobs, "publish-root")).join("\n")
  ).not.toContain("echo stale")
  expect(ci.name).toBe("ci")
})

test("removes a deselected publication capability and refuses a destructive workflow edit", () => {
  const created = reconcileSelection(selection)
  const withoutPackages = parseSelection([
    "runtimes=#lib,#server,#client,#integration,#gateway",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "eslint",
    "prettier",
    "git",
    "graphql",
    "docker",
    "httpd",
    "githubActions",
  ])
  const removed = reconcile({
    selection: withoutPackages,
    contributions: collectContributions(withoutPackages, facts),
    prior: created.lock,
    files: workflowFiles(created.files),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const ci = jobs(parseWorkflow(written(removed.files, ciPath)))
  expect(ci["publish-root"]).toBeUndefined()
  expect(ci["publish-client"]).toBeUndefined()
  expect(ci.release).toBeUndefined()
  expect(ci.registries).toBeUndefined()
  expect(ci["publish-images"]).toBeDefined()
  expect(ci.prepare).toBeDefined()
  expect(written(removed.files, checksPath)).not.toContain(
    "yarn bump-n-pub check-pack"
  )
  expect(written(removed.files, checksPath)).toContain("yarn build")

  const withoutDocker = parseSelection([
    "runtimes=#lib,#server,#client,#integration,#gateway",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "eslint",
    "prettier",
    "git",
    "graphql",
    "httpd",
    "githubActions",
    "githubPackage",
  ])
  const cleaned = reconcile({
    selection: withoutDocker,
    contributions: collectContributions(withoutDocker, facts),
    prior: created.lock,
    files: writtenFiles(created.files),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(cleaned.files).toContainEqual({
    type: "remove",
    path: integrationPath,
  })
  const remaining = jobs(parseWorkflow(written(cleaned.files, ciPath)))
  expect(remaining.integration).toBeUndefined()
  expect(remaining["publish-images"]).toBeUndefined()
  expect(remaining["publish-root"]).toBeDefined()

  const integration = requiredText(
    workflowTextsFrom(created.files),
    integrationPath
  )
  const error = reconcileError({
    selection: withoutDocker,
    contributions: collectContributions(withoutDocker, facts),
    prior: created.lock,
    files: writtenFiles(created.files, {
      [integrationPath]: `${integration}# edited\n`,
    }),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(error.problems).toEqual([
    `Cannot remove changed whole file "${integrationPath}" because its contents no longer match confgen.lock.`,
  ])

  const blocked = reconcileError({
    selection,
    contributions: collectContributions(selection, facts),
    prior: undefined,
    files: new Map([
      ["package.json", packageJson],
      [ciPath, "name: ci\non: push\njobs: custom\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(blocked.problems.join("\n")).toContain("jobs is not an object")
  expect(blocked.problems.join("\n")).toContain(ciPath)
})

const checksPath = ".github/workflows/checks.yml"
const integrationPath = ".github/workflows/integration.yml"
const ciPath = ".github/workflows/ci.yml"

function ciJobsFor(next: Selection): Record<string, unknown> {
  const created = reconcileSelection(next)
  return jobs(parseWorkflow(written(created.files, ciPath)))
}

function integrationJob(): Record<string, unknown> {
  const texts = workflowTexts(collectContributions(selection, facts))
  return requiredJob(
    jobs(parseWorkflow(requiredText(texts, integrationPath))),
    "integration"
  )
}

function reconcileSelection(next: Selection) {
  return reconcile({
    selection: next,
    contributions: collectContributions(next, facts),
    prior: undefined,
    files: new Map([["package.json", packageJson]]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
}

function reconcileError(input: {
  selection: Selection
  contributions: readonly Contribution[]
  prior: ReturnType<typeof reconcile>["lock"] | undefined
  files: ReadonlyMap<string, string>
  yarnLockPresent: boolean
  pnpPresent: boolean
}): ConfgenError {
  try {
    reconcile(input)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("expected ConfgenError")
}

function workflowTexts(
  contributions: readonly Contribution[]
): Map<string, string> {
  const texts = new Map<string, string>()
  for (const contribution of contributions) {
    if (contribution.kind !== "whole-file") continue
    if (!contribution.path.startsWith(".github/workflows/")) continue
    texts.set(contribution.path, contribution.contents)
  }
  return texts
}

function workflowTextsFrom(
  changes: readonly FileChange[]
): Map<string, string> {
  const texts = new Map<string, string>()
  for (const change of changes) {
    if (change.type !== "write") continue
    if (!change.path.startsWith(".github/workflows/")) continue
    texts.set(change.path, change.contents)
  }
  return texts
}

function workflowFiles(
  changes: readonly FileChange[],
  overrides: Readonly<Record<string, string>> = {}
): Map<string, string> {
  const files = workflowTextsFrom(changes)
  for (const [path, contents] of Object.entries(overrides)) {
    files.set(path, contents)
  }
  return files
}

function requiredText(texts: Map<string, string>, path: string): string {
  const text = texts.get(path)
  if (text === undefined) throw new Error(`missing ${path}`)
  return text
}

function written(changes: readonly FileChange[], path: string): string {
  const change = changes.find(
    (entry) => entry.type === "write" && entry.path === path
  )
  if (change === undefined || change.type !== "write") {
    throw new Error(`missing write ${path}`)
  }
  return change.contents
}

function parseWorkflow(text: string): Record<string, unknown> {
  const document = parseDocument(text)
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"))
  }
  return asRecord(document.toJS(), "workflow")
}

function jobs(workflow: Record<string, unknown>): Record<string, unknown> {
  return asRecord(workflow.jobs, "jobs")
}

function requiredJob(
  workflowJobs: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  return asRecord(workflowJobs[name], name)
}

function runsOn(job: Record<string, unknown>): string {
  const value = job["runs-on"]
  if (typeof value !== "string") throw new Error("missing runs-on")
  return value
}

function usesOf(job: Record<string, unknown>): string {
  const value = job.uses
  if (typeof value !== "string") throw new Error("missing uses")
  return value
}

function commands(job: Record<string, unknown>): string[] {
  return steps(job).flatMap((step) => {
    const run = step.run
    return typeof run === "string" ? [run] : []
  })
}

function taskCommands(job: Record<string, unknown>): string[] {
  return commands(job).filter(
    (command) =>
      command !== "corepack enable" && command !== "yarn install --immutable"
  )
}

function writtenFiles(
  changes: readonly FileChange[],
  overrides: Readonly<Record<string, string>> = {}
): Map<string, string> {
  const files = new Map<string, string>()
  for (const change of changes) {
    if (change.type === "write") files.set(change.path, change.contents)
  }
  for (const [path, contents] of Object.entries(overrides)) {
    files.set(path, contents)
  }
  return files
}

function steps(job: Record<string, unknown>): Record<string, unknown>[] {
  const value = job.steps
  if (!Array.isArray(value)) return []
  return value.flatMap((step) => (isRecord(step) ? [step] : []))
}

function imageTags(job: Record<string, unknown>): string[] {
  return steps(job).flatMap((step) => {
    if (!isRecord(step.with)) return []
    const tags = step.with.tags
    return typeof tags === "string" ? [tags] : []
  })
}

function stringList(job: Record<string, unknown>, field: string): string[] {
  const value = job[field]
  if (!Array.isArray(value)) throw new Error(`missing ${field}`)
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []))
}

function objectField(
  value: Record<string, unknown>,
  field: string
): Record<string, unknown> {
  return asRecord(value[field], field)
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
