import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import type { Selection } from "../selection.js"
import { containerIdentity, type ContainerIdentity } from "./docker.js"
import { stringify } from "yaml"

/**
 * GitHub Actions owns workflow assembly for the selected checks, packages,
 * containers, and release capabilities. Package publication uses each
 * manifest's publishConfig.registry; these workflows do not add another.
 * `bump-n-pub <increment> --bump-only` stays a local version commit and is
 * intentionally absent from CI. Image publication, npm publication, and
 * GitHub release creation stay explicit steps.
 */

const STANDARD_RUNNER = "ubuntu-slim"
const DOCKER_RUNNER = "ubuntu-latest"
const BUMP_N_PUB_VERSION = "0.30.0"
const CHECKS_WORKFLOW = ".github/workflows/checks.yml"
const INTEGRATION_WORKFLOW = ".github/workflows/integration.yml"
const CI_WORKFLOW = ".github/workflows/ci.yml"
const SHOULD_PUBLISH = "needs.prepare.outputs.should_publish == 'true'"
const PUBLISH_COMMAND =
  "yarn npm publish ${{ contains(needs.prepare.outputs.package_version, '-') && '--tag preview' || '' }}\n"
const RELEASE_IF =
  "contains(fromJSON(vars.PUBLISHING_BRANCHES), github.ref_name) && needs.prepare.outputs.should_publish == 'true' && !contains(needs.prepare.outputs.package_version, '-')"

export const contributions: ProduceContributions = (selection, facts) => {
  const checks = checksDocument(selection)
  const integration = integrationDocument(selection, facts)
  const jobs = ciJobs(selection, facts, {
    checks: checks !== undefined,
    integration: integration !== undefined,
  })
  const produced: Contribution[] = []
  if (checks !== undefined) {
    produced.push(wholeFile(CHECKS_WORKFLOW, renderWorkflow(checks)))
  }
  if (integration !== undefined) {
    produced.push(wholeFile(INTEGRATION_WORKFLOW, renderWorkflow(integration)))
  }
  if (Object.keys(jobs).length > 0) produced.push(...ciDocument(jobs))
  if (usesBumpNPub(selection)) produced.push(bumpDependency())
  return produced
}

function checksDocument(selection: Selection): JsonValue | undefined {
  const jobs: { [key: string]: JsonValue } = {}
  if (selection.presets.includes("prettier")) {
    jobs.format = commandJob(["yarn check:format"])
  }
  if (selection.presets.includes("eslint")) {
    jobs.lint = commandJob(lintCommands(selection))
  }
  if (selection.presets.includes("typescript")) {
    jobs.types = commandJob(typecheckCommands(selection))
  }
  if (selection.presets.includes("vitest")) {
    jobs.test = commandJob(testCommands(selection))
  }
  if (selection.presets.includes("vite")) jobs.build = buildJob(selection)
  if (Object.keys(jobs).length === 0) return undefined
  return {
    name: "checks",
    on: { workflow_call: workflowCall(jobs.build !== undefined) },
    permissions: { contents: "read" },
    jobs,
  }
}

function integrationDocument(
  selection: Selection,
  facts: ProjectFacts
): JsonValue | undefined {
  if (!publishesContainers(selection)) return undefined
  if (!selection.runtimes.includes("integration")) return undefined
  const identity = containerIdentity(facts.root.name)
  return {
    name: "integration",
    on: { workflow_call: {} },
    permissions: { contents: "read" },
    jobs: { integration: integrationJob(selection, identity) },
  }
}

function ciJobs(
  selection: Selection,
  facts: ProjectFacts,
  present: { checks: boolean; integration: boolean }
): { [key: string]: JsonValue } {
  const jobs: { [key: string]: JsonValue } = {}
  if (present.checks) jobs.checks = { uses: `./${CHECKS_WORKFLOW}` }
  if (present.integration) {
    jobs.integration = { uses: `./${INTEGRATION_WORKFLOW}` }
  }
  const registries = selection.presets.includes("githubPackage")
  const prepare = preparesRelease(selection)
  const images = publishesImages(selection)
  const root = publishesRoot(selection)
  const client = publishesClient(selection)
  if (registries) jobs.registries = registriesJob()
  if (prepare) jobs.prepare = prepareJob()
  const flags = {
    checks: present.checks,
    integration: present.integration,
    registries,
    prepare,
  }
  if (root) jobs["publish-root"] = publishRootJob(needsBeforePublish(flags))
  if (client) {
    jobs["publish-client"] = publishClientJob(needsBeforePublish(flags))
  }
  if (images) {
    jobs["publish-images"] = publishImagesJob(
      selection,
      facts,
      needsBeforePublish(flags)
    )
  }
  if (root || client) {
    jobs.release = releaseJob(releaseNeeds({ root, client, images, prepare }))
  }
  return jobs
}

function ciDocument(jobs: { [key: string]: JsonValue }): Contribution[] {
  const produced: Contribution[] = [
    structured("ci:name", ["name"], "ci"),
    structured("ci:on", ["on"], "push"),
    structured("ci:permissions", ["permissions"], { contents: "read" }),
    structured("ci:concurrency", ["concurrency"], {
      "group": "ci-${{ github.ref }}",
      "cancel-in-progress":
        "${{ !contains(fromJSON(vars.PUBLISHING_BRANCHES), github.ref_name) }}",
    }),
  ]
  const names = Object.keys(jobs).sort()
  for (const name of names) {
    const value = jobs[name]
    if (value === undefined) continue
    produced.push(structured(`ci:job:${name}`, ["jobs", name], value))
  }
  return produced
}

function commandJob(commands: readonly string[]): JsonValue {
  return {
    "runs-on": STANDARD_RUNNER,
    "steps": [
      ...setupSteps(),
      ...commands.map((command) => ({ run: command })),
    ],
  }
}

function buildJob(selection: Selection): JsonValue {
  const steps: JsonValue[] = [
    ...setupSteps(),
    {
      id: "build",
      name: "Build",
      run: 'yarn build\necho "built=true" >> "$GITHUB_OUTPUT"\n',
    },
  ]
  if (publishesPackages(selection)) {
    steps.push({ name: "Inspect packages", run: "yarn bump-n-pub check-pack" })
  }
  return {
    "runs-on": STANDARD_RUNNER,
    "outputs": { built: "${{ steps.build.outputs.built }}" },
    steps,
  }
}

function workflowCall(includeBuilt: boolean): JsonValue {
  if (!includeBuilt) return {}
  return {
    outputs: {
      built: {
        description: "Ordinary build completed",
        value: "${{ jobs.build.outputs.built }}",
      },
    },
  }
}

function integrationJob(
  selection: Selection,
  identity: ContainerIdentity
): JsonValue {
  const env: { [key: string]: JsonValue } = {
    IMAGE_TAG: "${{ github.sha }}",
    DEV_CLUSTER_STATE_DIR: "${{ github.workspace }}/.dev-cluster",
    SSL_PATH: "${{ github.workspace }}/.dev-cluster/certs",
  }
  env[identity.serviceUrlName] = identity.serviceUrl
  const steps: JsonValue[] = [
    ...setupSteps(),
    {
      name: "Set up Docker Compose",
      uses: "docker/setup-compose-action@v1",
      with: { version: "latest" },
    },
    {
      name: "Set up Docker Buildx",
      uses: "docker/setup-buildx-action@v4",
    },
    { name: "Create local certificates", run: "yarn dev-cluster certs" },
    imageBuild({
      name: `Build ${identity.serviceName}`,
      file: "Dockerfile",
      target: "prod",
      tags: `${identity.serviceName}:\${{ env.IMAGE_TAG }}`,
      push: false,
      cacheScope: `${identity.directoryName}-node`,
      cacheMode: "max",
    }),
  ]
  if (gatewaySelected(selection)) {
    steps.push(
      imageBuild({
        name: `Build ${identity.gatewayServiceName}`,
        file: "gateway/Dockerfile",
        tags: `${identity.gatewayServiceName}:\${{ env.IMAGE_TAG }}`,
        push: false,
        cacheScope: `${identity.directoryName}-gateway`,
        cacheMode: "min",
      })
    )
  }
  steps.push(
    imageBuild({
      name: `Build ${identity.integrationServiceName}`,
      file: "Dockerfile",
      target: "integration-test-host",
      tags: `${identity.integrationServiceName}:\${{ env.IMAGE_TAG }}`,
      push: false,
      cacheScope: `${identity.directoryName}-node`,
      cacheMode: "max",
    }),
    { name: "Run integration tests", run: "yarn test:integration:ci" }
  )
  return { "runs-on": DOCKER_RUNNER, env, steps }
}

function registriesJob(): JsonValue {
  return {
    "runs-on": STANDARD_RUNNER,
    "outputs": { checked: "${{ steps.registries.outputs.checked }}" },
    "env": { NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" },
    "steps": [
      ...setupSteps(),
      {
        id: "registries",
        name: "Check registries",
        run: 'yarn bump-n-pub check-registries\necho "checked=true" >> "$GITHUB_OUTPUT"\n',
      },
    ],
  }
}

function prepareJob(): JsonValue {
  return {
    "runs-on": STANDARD_RUNNER,
    "outputs": {
      package_version: "${{ steps.prepare.outputs.package_version }}",
      should_publish: "${{ steps.prepare.outputs.should_publish }}",
    },
    "env": {
      NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
      PUBLISHING_BRANCHES: "${{ vars.PUBLISHING_BRANCHES }}",
    },
    "steps": [
      ...setupSteps(),
      {
        id: "prepare",
        name: "Prepare release",
        run: 'yarn bump-n-pub prepare >> "$GITHUB_OUTPUT"\n',
      },
    ],
  }
}

function publishRootJob(needs: readonly string[]): JsonValue {
  return {
    "needs": [...needs],
    "if": SHOULD_PUBLISH,
    "runs-on": STANDARD_RUNNER,
    "permissions": { contents: "read", packages: "write" },
    "env": { NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" },
    "steps": [
      ...setupSteps(),
      { name: "Build packages", run: "yarn build" },
      { name: "Publish root package", run: PUBLISH_COMMAND },
    ],
  }
}

function publishClientJob(needs: readonly string[]): JsonValue {
  return {
    "needs": [...needs],
    "if": SHOULD_PUBLISH,
    "runs-on": STANDARD_RUNNER,
    "permissions": { contents: "read", packages: "write" },
    "env": { NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" },
    "steps": [
      ...setupSteps(),
      { name: "Build packages", run: "yarn build" },
      {
        "name": "Publish client package",
        "working-directory": "client",
        "run": PUBLISH_COMMAND,
      },
    ],
  }
}

function publishImagesJob(
  selection: Selection,
  facts: ProjectFacts,
  needs: readonly string[]
): JsonValue {
  const identity = containerIdentity(facts.root.name)
  const version = "${{ needs.prepare.outputs.package_version }}"
  const steps: JsonValue[] = [
    ...setupSteps(),
    { name: "Set up Docker Buildx", uses: "docker/setup-buildx-action@v4" },
    {
      name: "Log in to GHCR",
      uses: "docker/login-action@v3",
      with: {
        registry: "ghcr.io",
        username: "${{ github.actor }}",
        password: "${{ secrets.GITHUB_TOKEN }}",
      },
    },
    imageBuild({
      name: `Push ${identity.serviceName}`,
      file: "Dockerfile",
      target: "prod",
      tags: publishedTag(identity.serviceName, version),
      push: true,
      cacheScope: `${identity.directoryName}-node`,
    }),
  ]
  if (gatewaySelected(selection)) {
    steps.push(
      imageBuild({
        name: `Push ${identity.gatewayServiceName}`,
        file: "gateway/Dockerfile",
        tags: publishedTag(identity.gatewayServiceName, version),
        push: true,
        cacheScope: `${identity.directoryName}-gateway`,
      })
    )
  }
  return {
    "needs": [...needs],
    "if": SHOULD_PUBLISH,
    "runs-on": DOCKER_RUNNER,
    "permissions": { contents: "read", packages: "write" },
    steps,
  }
}

function releaseJob(needs: readonly string[]): JsonValue {
  return {
    "needs": [...needs],
    "if": RELEASE_IF,
    "runs-on": STANDARD_RUNNER,
    "permissions": { contents: "write" },
    "steps": [
      { name: "Check out", uses: "actions/checkout@v7" },
      {
        name: "Create GitHub release",
        env: { GH_TOKEN: "${{ github.token }}" },
        run: 'gh release create "v${{ needs.prepare.outputs.package_version }}" --generate-notes --target "${{ github.sha }}"\n',
      },
    ],
  }
}

function imageBuild(input: {
  name: string
  file: string
  target?: string
  tags: string
  push: boolean
  cacheScope: string
  cacheMode?: "max" | "min"
}): JsonValue {
  const withValue: { [key: string]: JsonValue } = {
    "context": ".",
    "file": input.file,
    "tags": input.tags,
    "cache-from": `type=gha,scope=${input.cacheScope}`,
  }
  if (input.target !== undefined) withValue.target = input.target
  if (input.push) {
    withValue.push = true
  } else {
    withValue.load = true
    const mode = input.cacheMode ?? "max"
    withValue["cache-to"] = `type=gha,mode=${mode},scope=${input.cacheScope}`
  }
  return {
    name: input.name,
    uses: "docker/build-push-action@v6",
    with: withValue,
  }
}

function setupSteps(): JsonValue[] {
  return [
    { name: "Check out", uses: "actions/checkout@v7" },
    { run: "corepack enable" },
    {
      name: "Enable Yarn cache",
      uses: "actions/cache@v6",
      with: {
        path: ".yarn/cache\n.yarn/unplugged\n",
        key: "yarn-${{ runner.os }}-${{ hashFiles('yarn.lock') }}",
      },
    },
    { run: "yarn install --immutable" },
  ]
}

function lintCommands(selection: Selection): string[] {
  const commands: string[] = []
  if (selection.presets.includes("graphql"))
    commands.push("yarn build:generate")
  commands.push("yarn check:lint")
  return commands
}

function typecheckCommands(selection: Selection): string[] {
  if (
    selection.presets.includes("vite") ||
    selection.presets.includes("graphql")
  ) {
    return ["yarn build && yarn check:types"]
  }
  return ["yarn check:types"]
}

function testCommands(selection: Selection): string[] {
  const commands: string[] = []
  if (selection.presets.includes("graphql"))
    commands.push("yarn build:generate")
  commands.push("yarn test")
  return commands
}

function needsBeforePublish(flags: {
  checks: boolean
  integration: boolean
  registries: boolean
  prepare: boolean
}): string[] {
  const needs: string[] = []
  if (flags.checks) needs.push("checks")
  if (flags.integration) needs.push("integration")
  if (flags.registries) needs.push("registries")
  if (flags.prepare) needs.push("prepare")
  return needs
}

function releaseNeeds(flags: {
  root: boolean
  client: boolean
  images: boolean
  prepare: boolean
}): string[] {
  const needs: string[] = []
  if (flags.prepare) needs.push("prepare")
  if (flags.root) needs.push("publish-root")
  if (flags.client) needs.push("publish-client")
  if (flags.images) needs.push("publish-images")
  return needs
}

function publishedTag(serviceName: string, version: string): string {
  return `ghcr.io/\${{ github.repository_owner }}/${serviceName}:${version}`
}

function publishesPackages(selection: Selection): boolean {
  return publishesRoot(selection) || publishesClient(selection)
}

function publishesRoot(selection: Selection): boolean {
  return (
    selection.presets.includes("githubPackage") &&
    selection.presets.includes("vite") &&
    selection.runtimes.includes("lib")
  )
}

function publishesClient(selection: Selection): boolean {
  return (
    selection.presets.includes("githubPackage") &&
    selection.presets.includes("vite") &&
    selection.runtimes.includes("client")
  )
}

function publishesImages(selection: Selection): boolean {
  return publishesContainers(selection)
}

function publishesContainers(selection: Selection): boolean {
  return (
    selection.presets.includes("docker") &&
    selection.runtimes.includes("server")
  )
}

function preparesRelease(selection: Selection): boolean {
  return (
    selection.presets.includes("githubPackage") || publishesImages(selection)
  )
}

function usesBumpNPub(selection: Selection): boolean {
  return preparesRelease(selection)
}

function gatewaySelected(selection: Selection): boolean {
  return (
    selection.runtimes.includes("gateway") &&
    selection.presets.includes("httpd")
  )
}

function renderWorkflow(document: JsonValue): string {
  const text = stringify(document)
  return text.endsWith("\n") ? text : `${text}\n`
}

function wholeFile(path: string, contents: string): Contribution {
  return {
    id: `github-actions:file:${path}`,
    source: "preset:githubActions",
    kind: "whole-file",
    path,
    contents,
  }
}

function structured(
  id: string,
  address: StructuredAddress,
  value: JsonValue
): Contribution {
  return {
    id: `github-actions:${id}`,
    source: "preset:githubActions",
    kind: "structured",
    path: CI_WORKFLOW,
    format: "yaml",
    address,
    value,
    update: "replace",
  }
}

function bumpDependency(): Contribution {
  return {
    id: "github-actions:dependency:bump-n-pub",
    source: "preset:githubActions",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: "bump-n-pub",
    range: BUMP_N_PUB_VERSION,
  }
}
