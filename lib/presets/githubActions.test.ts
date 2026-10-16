import { collectContributions } from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import { reconcile } from "../reconcile.js"
import { parseSelection } from "../selection.js"
import { expect, test } from "vitest"
import { parseDocument } from "yaml"

const root = {
  path: "package.json",
  name: "@example/package-service",
  version: "0.1.0",
  repository: {
    type: "git",
    url: "https://github.com/example/package-service.git",
  },
  workspaces: ["client"],
  dependencies: [],
  registry: "https://npm.example.test",
}
const client = {
  ...root,
  path: "client/package.json",
  name: "@example/package-service-client",
  workspaces: [],
}
const facts: ProjectFacts = { root, packages: [root, client] }
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

test("generates the seven reusable workflows and the established call graph", () => {
  const workflows = workflowTexts(selection, facts)
  expect([...workflows.keys()].sort()).toEqual([
    ".github/workflows/artifacts.yml",
    ".github/workflows/check-code-format.yml",
    ".github/workflows/check-lint.yml",
    ".github/workflows/check-types.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/integration-tests.yml",
    ".github/workflows/unit-tests.yml",
  ])

  const ci = parseWorkflow(required(workflows, ".github/workflows/ci.yml"))
  const ciJobs = record(ci.jobs)
  expect(Object.keys(ciJobs).sort()).toEqual([
    "artifacts",
    "code-format",
    "integration-tests",
    "lint",
    "types",
    "unit-tests",
  ])
  expect(record(ciJobs["code-format"]).uses).toBe(
    "./.github/workflows/check-code-format.yml"
  )
  expect(record(ciJobs.lint).uses).toBe("./.github/workflows/check-lint.yml")
  expect(record(ciJobs.types).uses).toBe("./.github/workflows/check-types.yml")
  expect(record(ciJobs["unit-tests"]).uses).toBe(
    "./.github/workflows/unit-tests.yml"
  )
  expect(record(ciJobs["integration-tests"]).uses).toBe(
    "./.github/workflows/integration-tests.yml"
  )
  expect(record(ciJobs.artifacts).uses).toBe(
    "./.github/workflows/artifacts.yml"
  )
  expect(record(ciJobs.artifacts).needs).toEqual([
    "types",
    "lint",
    "code-format",
    "unit-tests",
    "integration-tests",
  ])
  expect(ciJobs.checks).toBeUndefined()
  expect(ciJobs.integration).toBeUndefined()
})

test("keeps existing integration workflow spelling", () => {
  for (const path of [
    ".github/workflows/integration-tests.yml",
    ".github/workflows/integration-tests.yaml",
  ] as const) {
    const withExistingPath = { ...facts, integrationWorkflowPath: path }
    const workflows = workflowTexts(selection, withExistingPath)
    expect(workflows.has(path)).toBe(true)
    const ciJobs = record(
      parseWorkflow(required(workflows, ".github/workflows/ci.yml")).jobs
    )
    expect(record(ciJobs["integration-tests"]).uses).toBe(`./${path}`)
  }
})

test("keeps publication in one artifacts job and preserves command order", () => {
  const workflows = workflowTexts(selection, facts)
  expect(
    commandTexts(required(workflows, ".github/workflows/check-code-format.yml"))
  ).toContain("yarn check:format")
  expect(
    commandTexts(required(workflows, ".github/workflows/check-lint.yml"))
  ).toContain("yarn check:lint")
  expect(
    commandTexts(required(workflows, ".github/workflows/check-types.yml"))
  ).toContain("yarn build && yarn check:types")
  expect(
    commandTexts(required(workflows, ".github/workflows/unit-tests.yml"))
  ).toContain("yarn test")
  const integration = required(
    workflows,
    ".github/workflows/integration-tests.yml"
  )
  expect(commandTexts(integration)).toContain("yarn dev-cluster certs")
  expect(commandTexts(integration)).toContain("yarn test:integration:ci")

  const artifacts = parseWorkflow(
    required(workflows, ".github/workflows/artifacts.yml")
  )
  const artifactJobs = record(artifacts.jobs)
  expect(Object.keys(artifactJobs)).toEqual(["package"])
  const packageJob = requiredWorkflow(artifactJobs, "package")
  expect(packageJob["runs-on"]).toBe("ubuntu-latest")
  const steps = jobSteps(packageJob)
  expect(
    steps.map((step) => step.name).filter((name) => typeof name === "string")
  ).toEqual([
    "Check out",
    "Enable Yarn cache",
    "Check registries",
    "Prepare release",
    "Stamp published Compose image tags",
    "Build packages",
    "Inspect packages",
    "Set up Docker Buildx",
    "Log in to GHCR",
    "Push package-api-server image to registry",
    "Push package-service image to registry",
    "Publish service package",
    "Publish client package",
    "Create GitHub release",
  ])
  const commands = commandsInJob(packageJob).join("\n")
  expect(commands).toContain('yarn bump-n-pub prepare >> "$GITHUB_OUTPUT"')
  expect(commands).toContain("yarn bump-n-pub check-registries")
  expect(commands).toContain("yarn bump-n-pub check-pack")
  expect(commands).toContain("gh release create")
  expect(commands).toContain("source.replaceAll(token, imageTag)")
  expect(
    record(
      stepWithName(packageJob, "Push package-api-server image to registry").with
    ).tags
  ).toBe("ghcr.io/example/package-api-server:${{ env.IMAGE_TAG }}")
  expect(
    record(
      stepWithName(packageJob, "Push package-service image to registry").with
    ).tags
  ).toBe("ghcr.io/example/package-service:${{ env.IMAGE_TAG }}")
})

test("preserves Schema Service's no-release artifacts policy", () => {
  const schemaFacts: ProjectFacts = {
    root: {
      ...root,
      name: "@example/schema-service",
      workspaces: [],
      dependencies: [],
    },
    packages: [
      {
        ...root,
        name: "@example/schema-service",
        workspaces: [],
        dependencies: [],
      },
    ],
    integrationWorkflowPath: ".github/workflows/integration-tests.yml",
    publishGitHubRelease: false,
    publishClientPackage: false,
  }
  const schemaSelection = parseSelection([
    "runtimes=#server,#integration",
    "yarn",
    "typescript",
    "vitest",
    "eslint",
    "prettier",
    "docker",
    "githubActions",
    "githubPackage",
  ])
  const workflows = workflowTexts(schemaSelection, schemaFacts)
  const jobs = record(
    parseWorkflow(required(workflows, ".github/workflows/artifacts.yml")).jobs
  )
  const packageJob = requiredWorkflow(jobs, "package")
  expect(
    jobSteps(packageJob).some((step) => step.name === "Create GitHub release")
  ).toBe(false)
  expect(
    jobSteps(packageJob).some((step) => step.name === "Publish client package")
  ).toBe(false)
})

function workflowTexts(
  next: typeof selection,
  project: ProjectFacts
): Map<string, string> {
  const result = reconcile({
    selection: next,
    contributions: collectContributions(next, project),
    prior: undefined,
    files: new Map([["package.json", '{"name":"@example/package-service"}\n']]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  return new Map(
    result.files.flatMap((change) =>
      change.type === "write" && change.path.startsWith(".github/workflows/")
        ? [[change.path, change.contents] as const]
        : []
    )
  )
}

function required(workflows: Map<string, string>, path: string): string {
  const value = workflows.get(path)
  if (value === undefined) throw new Error(`missing ${path}`)
  return value
}

function parseWorkflow(text: string): Record<string, unknown> {
  const document = parseDocument(text)
  if (document.errors.length > 0)
    throw new Error(document.errors.map((error) => error.message).join("\n"))
  return record(document.toJS())
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected object")
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredWorkflow(
  jobs: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  return record(jobs[name])
}

function jobSteps(job: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(job.steps) ? job.steps.map(record) : []
}

function stepWithName(
  job: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  const step = jobSteps(job).find((entry) => entry.name === name)
  if (step === undefined) throw new Error(`missing step ${name}`)
  return step
}

function commandTexts(text: string): string[] {
  const workflow = parseWorkflow(text)
  const jobs = record(workflow.jobs)
  return Object.values(jobs).flatMap((job) => {
    const steps = record(job).steps
    return Array.isArray(steps)
      ? steps.flatMap((step) => {
          const run = record(step).run
          return typeof run === "string" ? [run] : []
        })
      : []
  })
}

function commandsInJob(job: Record<string, unknown>): string[] {
  return jobSteps(job).flatMap((step) => {
    const run = step.run
    return typeof run === "string" ? [run] : []
  })
}
