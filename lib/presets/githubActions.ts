import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import type { Selection } from "../selection.js"
import { requireContainerIdentity, type ContainerIdentity } from "./docker.js"
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
const FORMAT_WORKFLOW = ".github/workflows/check-code-format.yml"
const LINT_WORKFLOW = ".github/workflows/check-lint.yml"
const TYPES_WORKFLOW = ".github/workflows/check-types.yml"
const UNIT_WORKFLOW = ".github/workflows/unit-tests.yml"
const DEFAULT_INTEGRATION_WORKFLOW = ".github/workflows/integration-tests.yml"
const ARTIFACTS_WORKFLOW = ".github/workflows/artifacts.yml"
const CI_WORKFLOW = ".github/workflows/ci.yml"
const STEP_SHOULD_PUBLISH = "steps.prepare.outputs.should_publish == 'true'"
const PUBLISH_COMMAND =
  "yarn npm publish ${{ contains(steps.prepare.outputs.package_version, '-') && '--tag preview' || '' }}"
const RELEASE_IF =
  "contains(fromJSON(vars.PUBLISHING_BRANCHES), github.ref_name) && steps.prepare.outputs.should_publish == 'true' && !contains(steps.prepare.outputs.package_version, '-')"

export const contributions: ProduceContributions = (selection, facts) => {
  const workflows = checkDocuments(selection)
  const integrationPath =
    facts.integrationWorkflowPath ?? DEFAULT_INTEGRATION_WORKFLOW
  const integration = integrationDocument(selection, facts)
  const hasArtifacts = preparesRelease(selection)
  const releases = facts.publishGitHubRelease ?? publishesPackages(selection)
  const jobs = ciCallJobs(
    selection,
    integrationPath,
    integration !== undefined,
    hasArtifacts,
    releases
  )
  const produced: Contribution[] = []
  for (const [path, document] of workflows)
    produced.push(wholeFile(path, renderWorkflow(document)))
  if (integration !== undefined) {
    produced.push(wholeFile(integrationPath, renderWorkflow(integration)))
  }
  if (hasArtifacts) {
    produced.push(
      wholeFile(
        ARTIFACTS_WORKFLOW,
        renderWorkflow(artifactsDocument(selection, facts))
      )
    )
  }
  if (Object.keys(jobs).length > 0) produced.push(...ciDocument(jobs))
  if (usesBumpNPub(selection)) produced.push(bumpDependency())
  return produced
}

function checkDocuments(selection: Selection): Map<string, JsonValue> {
  const docs = new Map<string, JsonValue>()
  if (selection.presets.includes("prettier"))
    docs.set(
      FORMAT_WORKFLOW,
      checkDocument("code format", "check-code-format", ["yarn check:format"])
    )
  if (selection.presets.includes("eslint"))
    docs.set(
      LINT_WORKFLOW,
      checkDocument("lint", "check-lint", lintCommands(selection))
    )
  if (selection.presets.includes("typescript"))
    docs.set(
      TYPES_WORKFLOW,
      checkDocument("types", "check-types", typecheckCommands(selection))
    )
  if (selection.presets.includes("vitest"))
    docs.set(
      UNIT_WORKFLOW,
      checkDocument(
        "unit tests",
        "run-unit-tests",
        testCommands(selection),
        "run"
      )
    )
  return docs
}

function checkDocument(
  name: string,
  concurrency: string,
  commands: readonly string[],
  jobName = "check"
): JsonValue {
  return {
    name,
    on: "workflow_call",
    concurrency: { group: concurrency, "cancel-in-progress": true },
    jobs: {
      [jobName]: {
        "runs-on": STANDARD_RUNNER,
        steps: [...setupSteps(), ...commands.map((run) => ({ run }))],
      },
    },
  }
}

function integrationDocument(
  selection: Selection,
  facts: ProjectFacts
): JsonValue | undefined {
  if (!publishesContainers(selection)) return undefined
  if (!selection.runtimes.includes("integration")) return undefined
  const identity = requireContainerIdentity(facts)
  const env: { [key: string]: JsonValue } = {
    DEV_CLUSTER_STATE_DIR: "${{ github.workspace }}/.dev-cluster",
    SSL_PATH: "${{ github.workspace }}/.dev-cluster/certs",
    IMAGE_TAG: "${{ github.sha }}",
  }
  if (facts.publishGitHubRelease === false) {
    env.EXPRESS_SESSION_SECRETS =
      "${{ github.run_id }}-${{ github.run_attempt }}"
  }
  env[identity.serviceUrlName] = identity.serviceUrl
  if (facts.root.dependencies.includes("@multiplayerdb/package-service")) {
    env.PACKAGE_SERVICE_URL = "https://package-service.local.multiplayerdb.dev"
  }
  return {
    name: "integration tests",
    on: "workflow_call",
    permissions: { contents: "read" },
    env,
    concurrency: {
      group: "run-integration-tests-${{ github.ref }}",
      "cancel-in-progress":
        "${{ !contains(fromJSON(vars.PUBLISHING_BRANCHES), github.ref_name) }}",
    },
    jobs: {
      run: integrationJob(
        selection,
        identity,
        facts.publishGitHubRelease === false
      ),
    },
  }
}

function ciCallJobs(
  selection: Selection,
  integrationPath: string,
  integration: boolean,
  artifacts: boolean,
  releases: boolean
): { [key: string]: JsonValue } {
  const jobs: { [key: string]: JsonValue } = {}
  if (selection.presets.includes("typescript"))
    jobs.types = { uses: `./${TYPES_WORKFLOW}` }
  if (selection.presets.includes("eslint"))
    jobs.lint = { uses: `./${LINT_WORKFLOW}` }
  if (selection.presets.includes("prettier"))
    jobs["code-format"] = { uses: `./${FORMAT_WORKFLOW}` }
  if (selection.presets.includes("vitest"))
    jobs["unit-tests"] = { uses: `./${UNIT_WORKFLOW}` }
  if (integration) jobs["integration-tests"] = { uses: `./${integrationPath}` }
  if (artifacts) {
    jobs.artifacts = {
      needs: Object.keys(jobs),
      uses: `./${ARTIFACTS_WORKFLOW}`,
      permissions: {
        contents: releases ? "write" : "read",
        packages:
          publishesContainers(selection) || publishesPackages(selection)
            ? "write"
            : "read",
      },
    }
  }
  return jobs
}

function artifactsDocument(
  selection: Selection,
  facts: ProjectFacts
): JsonValue {
  const releases = facts.publishGitHubRelease ?? publishesPackages(selection)
  const publishesClientPackage =
    facts.publishClientPackage ?? publishesClient(selection)
  const steps = [...setupSteps()]
  if (selection.presets.includes("githubPackage")) {
    steps.push({
      name: "Check registries",
      run: "yarn bump-n-pub check-registries",
    })
  }
  const prepareStep: JsonValue = {
    id: "prepare",
    name: "Prepare release",
    run: 'npm config set //npm.pkg.github.com/:_authToken "$NODE_AUTH_TOKEN"\nyarn bump-n-pub prepare >> "$GITHUB_OUTPUT"\n',
    env: { NPM_CONFIG_USERCONFIG: "${{ runner.temp }}/.npmrc" },
  }
  const packageChecks: JsonValue[] = publishesPackages(selection)
    ? [
        { name: "Build packages", run: "yarn build" },
        { name: "Inspect packages", run: "yarn bump-n-pub check-pack" },
      ]
    : []
  const images = containerPublishSteps(selection, facts)
  if (publishesPackages(selection) && !releases) {
    steps.push(...images, prepareStep, ...packageChecks)
  } else {
    steps.push(prepareStep)
    if (releases && publishesPackages(selection)) {
      steps.push({
        name: "Stamp published Compose image tags",
        if: STEP_SHOULD_PUBLISH,
        run: STAMP_COMPOSE,
      })
    }
    steps.push(...packageChecks)
    steps.push(...images)
  }
  if (publishesRoot(selection)) {
    steps.push({
      name: "Publish service package",
      if: STEP_SHOULD_PUBLISH,
      run: PUBLISH_COMMAND,
    })
  }
  if (publishesClientPackage && publishesClient(selection)) {
    steps.push({
      name: "Publish client package",
      if: STEP_SHOULD_PUBLISH,
      "working-directory": "client",
      run: PUBLISH_COMMAND,
    })
  }
  if (releases && publishesPackages(selection)) {
    steps.push({
      name: "Create GitHub release",
      if: RELEASE_IF,
      env: { GH_TOKEN: "${{ github.token }}" },
      run: 'gh release create "v${{ steps.prepare.outputs.package_version }}" --generate-notes --target "${{ github.sha }}"',
    })
  }
  return {
    name: "artifacts",
    on: "workflow_call",
    permissions: {
      contents: releases && publishesPackages(selection) ? "write" : "read",
      packages:
        publishesContainers(selection) || publishesPackages(selection)
          ? "write"
          : "read",
    },
    env: { IMAGE_TAG: "${{ github.sha }}" },
    concurrency: {
      group: "package-${{ github.ref }}",
      "cancel-in-progress": true,
    },
    jobs: {
      package: {
        "runs-on": DOCKER_RUNNER,
        env: {
          NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
          ...(preparesRelease(selection)
            ? { PUBLISHING_BRANCHES: "${{ vars.PUBLISHING_BRANCHES }}" }
            : {}),
        },
        steps,
      },
    },
  }
}

function containerPublishSteps(
  selection: Selection,
  facts: ProjectFacts
): JsonValue[] {
  if (!publishesContainers(selection)) return []
  const identity = requireContainerIdentity(facts)
  const steps: JsonValue[] = [
    {
      name: "Set up Docker Buildx",
      if: STEP_SHOULD_PUBLISH,
      uses: "docker/setup-buildx-action@v4",
    },
    {
      name: "Log in to GHCR",
      if: STEP_SHOULD_PUBLISH,
      uses: "docker/login-action@v3",
      with: {
        registry: "ghcr.io",
        username: "${{ github.actor }}",
        password: "${{ secrets.GITHUB_TOKEN }}",
      },
    },
    imageBuild({
      name: `Push ${identity.serviceName} image to registry`,
      file: "Dockerfile",
      target: "prod",
      tags: ghcrBuildTag(identity, identity.serviceName),
      push: true,
      cacheScope: gatewaySelected(selection)
        ? `${identity.directoryName}-node-v2`
        : identity.serviceName,
      ...(gatewaySelected(selection) ? {} : { cacheMode: "max" }),
      if: STEP_SHOULD_PUBLISH,
    }),
  ]
  if (gatewaySelected(selection)) {
    steps.push(
      imageBuild({
        name: `Push ${identity.gatewayServiceName} image to registry`,
        file: "gateway/Dockerfile",
        tags: ghcrBuildTag(identity, identity.gatewayServiceName),
        push: true,
        cacheScope: `${identity.directoryName}-httpd-v1`,
        if: STEP_SHOULD_PUBLISH,
      })
    )
  }
  return steps
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

function integrationJob(
  selection: Selection,
  identity: ContainerIdentity,
  cacheIntegrationHost: boolean
): JsonValue {
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
    { run: "yarn dev-cluster certs" },
    imageBuild({
      name: `Build ${identity.serviceName}`,
      file: "Dockerfile",
      target: "prod",
      tags: ghcrBuildTag(identity, identity.serviceName),
      push: false,
      cacheScope: gatewaySelected(selection)
        ? `${identity.directoryName}-node-v2`
        : identity.serviceName,
      cacheMode: "max",
    }),
  ]
  if (gatewaySelected(selection)) {
    steps.push(
      imageBuild({
        name: `Build ${identity.gatewayServiceName}`,
        file: "gateway/Dockerfile",
        tags: ghcrBuildTag(identity, identity.gatewayServiceName),
        push: false,
        cacheScope: `${identity.directoryName}-httpd-v1`,
        cacheMode: "min",
      })
    )
  }
  steps.push(
    imageBuild({
      name: `Build ${identity.integrationServiceName}`,
      file: "Dockerfile",
      target: "integration-test-host",
      tags: ghcrBuildTag(identity, identity.integrationServiceName),
      push: false,
      cacheScope: gatewaySelected(selection)
        ? `${identity.directoryName}-node-v2`
        : identity.serviceName,
      ...(cacheIntegrationHost ? { cacheMode: "max" as const } : {}),
    }),
    { run: "yarn test:integration:ci" }
  )
  return {
    "runs-on": DOCKER_RUNNER,
    env: { NODE_AUTH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" },
    steps,
  }
}

/**
 * Rewrites the committed Compose placeholder in the publish checkout.
 * Exits 1 when the placeholder is missing so the package cannot be published
 * with an unstamped image tag.
 */
const STAMP_COMPOSE = `node --input-type=module -e 'import { readFileSync, writeFileSync } from "node:fs"; const token = "\${IMAGE_TAG:?}"; const path = "compose.base.yaml"; const source = readFileSync(path, "utf8"); if (!source.includes(token)) { console.error("compose.base.yaml does not contain \${IMAGE_TAG:?}"); process.exit(1) }; const imageTag = process.env.IMAGE_TAG; if (!imageTag) { console.error("IMAGE_TAG is missing"); process.exit(1) }; writeFileSync(path, source.replaceAll(token, imageTag))'`

function imageBuild(input: {
  name: string
  file: string
  target?: string
  tags: string
  push: boolean
  cacheScope: string
  cacheMode?: "max" | "min"
  if?: string
}): JsonValue {
  const withValue: { [key: string]: JsonValue } = {
    "context": ".",
    "file": input.file,
  }
  if (input.target !== undefined) withValue.target = input.target
  withValue.tags = input.tags
  if (input.push) {
    withValue.push = true
  } else {
    withValue.load = true
  }
  withValue["cache-from"] = `type=gha,scope=${input.cacheScope}`
  if (!input.push && input.cacheMode !== undefined) {
    withValue[
      "cache-to"
    ] = `type=gha,mode=${input.cacheMode},scope=${input.cacheScope}`
  }
  if (input.push && input.cacheMode !== undefined) {
    withValue[
      "cache-to"
    ] = `type=gha,mode=${input.cacheMode},scope=${input.cacheScope}`
  }
  withValue.secrets = "NODE_AUTH_TOKEN=${{ github.token }}"
  return {
    name: input.name,
    ...(input.if === undefined ? {} : { if: input.if }),
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
  void selection
  return ["yarn test"]
}

function ghcrBuildTag(
  identity: ContainerIdentity,
  serviceName: string
): string {
  return `ghcr.io/${identity.owner}/${serviceName}:\${{ env.IMAGE_TAG }}`
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
  const text = stringify(document, { lineWidth: 0 })
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
