import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createSyntheticProject,
  packConfgen,
  packDevCluster,
  readScenario,
  type PackedConfgen,
  type SyntheticProject,
} from "./helpers.js"
import { afterAll, beforeAll, expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/package-service/", import.meta.url)
)
const rootName = "@example/package-service"
const clientName = "@example/package-service-client"

let packed: PackedConfgen | undefined

beforeAll(async () => {
  packed = await packConfgen()
})

afterAll(async () => {
  await packed?.cleanup()
})

test(
  "the packed package service builds, publishes, and reruns cleanly",
  { timeout: 900_000 },
  async () => {
    const bundle = packed
    if (bundle === undefined) throw new Error("Confgen was not packed")
    const args = await readScenario(fixture)
    const devCluster = await packDevCluster()
    const project = await createSyntheticProject({
      tarball: bundle.tarball,
      fixture,
    })
    const consumerDirectory = await mkdtemp(join(tmpdir(), "confgen-consumer-"))
    const sslDirectory = await mkdtemp(join(tmpdir(), "confgen-ssl-"))
    const composeProject = `confgen-package-${process.pid}`
    const composeEnv = {
      COMPOSE_PROJECT_NAME: composeProject,
      IMAGE_TAG: "test",
      SSL_PATH: sslDirectory,
    }
    try {
      await pinDevCluster(project, devCluster.tarball)
      await project.run("yarn", ["confgen", ...args], 180_000)
      await project.run("yarn", ["install"], 180_000)
      await proveContainer(project, composeEnv)
      await project.run("yarn", ["build:generate"], 180_000)
      await project.run("yarn", ["build:lib"], 180_000)
      await project.run("yarn", ["build:test-kit"], 180_000)
      await project.run("yarn", ["build:server"], 180_000)
      await project.run("yarn", ["build:client"], 180_000)
      await project.run("yarn", ["check:types"], 180_000)
      await project.run("yarn", ["check:lint"], 180_000)
      await project.run("yarn", ["check:format"], 180_000)
      await project.run("yarn", ["test"], 180_000)
      await expectPublishedPackages(project)
      await project.run("yarn", ["yalc:publish"], 180_000)
      await consumePublishedPackages(project, consumerDirectory)
      await project.run("git", ["init"])
      await project.run("git", ["add", "--all"])
      await project.run("git", [
        "-c",
        "user.email=confgen@example.com",
        "-c",
        "user.name=Confgen",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "package service",
      ])
      await project.run("yarn", ["confgen"], 180_000)
      const status = await project.run("git", ["status", "--porcelain"])
      expect(status.stdout).toBe("")
    } finally {
      await stopContainers(project, composeEnv)
      await rm(consumerDirectory, { recursive: true, force: true })
      await rm(sslDirectory, { recursive: true, force: true })
      await devCluster.cleanup()
      await project.cleanup()
    }
  }
)

async function pinDevCluster(
  project: SyntheticProject,
  tarball: string
): Promise<void> {
  const destination = join(project.directory, ".yalc", "dev-cluster")
  await mkdir(destination, { recursive: true })
  await project.run("tar", [
    "-xzf",
    tarball,
    "-C",
    destination,
    "--strip-components=1",
  ])
  const path = join(project.directory, "package.json")
  const value: unknown = JSON.parse(await readFile(path, "utf8"))
  if (!isRecord(value)) throw new Error("package.json must be an object")
  const current = isRecord(value.resolutions) ? value.resolutions : {}
  const next = {
    ...value,
    resolutions: {
      ...current,
      "dev-cluster": "file:.yalc/dev-cluster",
    },
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`)
}

async function proveContainer(
  project: SyntheticProject,
  env: Readonly<Record<string, string>>
): Promise<void> {
  const stateDirectory = env.SSL_PATH
  if (stateDirectory === undefined) throw new Error("missing SSL_PATH")
  await project.run("yarn", ["dev-cluster", "certs"], 60_000, {
    DEV_CLUSTER_STATE_DIR: stateDirectory,
  })
  const composeEnv = {
    ...env,
    SSL_PATH: join(stateDirectory, "certs"),
  }
  const configured = await project.run(
    "docker",
    [
      "compose",
      "-f",
      "compose.base.yaml",
      "-f",
      "compose.local.yaml",
      "config",
    ],
    60_000,
    composeEnv
  )
  expect(configured.stdout).toContain("package-api-server")
  expect(configured.stdout).toContain("target: dev")
  expect(configured.stdout).toContain("/healthcheck")
  expect(configured.stdout).not.toContain("integration-test")
  const base = await project.run(
    "docker",
    ["compose", "-f", "compose.base.yaml", "config"],
    60_000,
    composeEnv
  )
  expect(base.stdout).toContain("package-api-server:test")
  expect(base.stdout).not.toContain("target: dev")
  expect(base.stdout).not.toContain("/mnt/package-service")

  await project.run(
    "docker",
    ["build", "--target", "prod", "-t", "package-api-server:test", "."],
    600_000,
    composeEnv
  )
  try {
    await project.run(
      "docker",
      [
        "compose",
        "-f",
        "compose.base.yaml",
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        "--pull",
        "never",
      ],
      180_000,
      composeEnv
    )
    const listed = await project.run(
      "docker",
      ["compose", "-f", "compose.base.yaml", "ps", "-q", "package-api-server"],
      30_000,
      composeEnv
    )
    const containerId = listed.stdout.trim()
    const health = await project.run(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", containerId],
      30_000,
      composeEnv
    )
    expect(health.stdout.trim()).toBe("healthy")
    const response = await project.run(
      "docker",
      [
        "compose",
        "-f",
        "compose.base.yaml",
        "exec",
        "-T",
        "package-api-server",
        "curl",
        "--fail",
        "--silent",
        "http://127.0.0.1:7001/",
      ],
      30_000,
      composeEnv
    )
    expect(response.stdout).toContain("Hello, baseline")
    const check = await project.run(
      "docker",
      [
        "compose",
        "-f",
        "compose.base.yaml",
        "exec",
        "-T",
        "package-api-server",
        "curl",
        "--fail",
        "--silent",
        "http://127.0.0.1:7001/healthcheck",
      ],
      30_000,
      composeEnv
    )
    expect(check.stdout).toContain("ok")
  } finally {
    await stopContainers(project, composeEnv)
  }
}

async function stopContainers(
  project: SyntheticProject,
  env: Readonly<Record<string, string>>
): Promise<void> {
  try {
    await project.run(
      "docker",
      ["compose", "-f", "compose.base.yaml", "down", "-v", "--remove-orphans"],
      120_000,
      env
    )
  } catch {
    // The service may not have started.
  }
}

async function expectPublishedPackages(
  project: SyntheticProject
): Promise<void> {
  await expectFile(project.directory, "dist/lib/index.js")
  await expectFile(project.directory, "dist/lib/index.d.ts")
  await expectFile(project.directory, "dist/test/index.js")
  await expectFile(project.directory, "dist/test/index.d.ts")
  await expectFile(project.directory, "client/dist/index.js")
  await expectFile(project.directory, "client/dist/client/index.d.ts")
  const rootManifest = await readManifest(project.directory, "package.json")
  expect(rootManifest.name).toBe(rootName)
  expect(rootManifest.type).toBe("module")
  expect(publishRegistry(rootManifest)).toBe("https://npm.example.test")
  expect(exportImport(rootManifest, ".")).toBe("./dist/lib/index.js")
  expect(exportTypes(rootManifest, ".")).toBe("./dist/lib/index.d.ts")
  expect(exportImport(rootManifest, "./test")).toBe("./dist/test/index.js")
  expect(exportTypes(rootManifest, "./test")).toBe("./dist/test/index.d.ts")
  const clientManifest = await readManifest(
    project.directory,
    "client/package.json"
  )
  expect(clientManifest.name).toBe(clientName)
  expect(clientManifest.version).toBe(rootManifest.version)
  expect(clientManifest.type).toBe("module")
  expect(publishRegistry(clientManifest)).toBe("https://npm.example.test")
  expect(exportImport(clientManifest, ".")).toBe("./dist/index.js")
  expect(exportTypes(clientManifest, ".")).toBe("./dist/client/index.d.ts")
  expect(clientManifest.imports).toBeUndefined()
  const inspected = await project.run("yarn", ["inspect:pack"], 180_000)
  expect(inspected.stdout).toContain("dist/lib/index.js")
  expect(inspected.stdout).toContain("dist/lib/index.d.ts")
  expect(inspected.stdout).toContain("dist/test/index.js")
  expect(inspected.stdout).toContain("dist/client/index.d.ts")
  expect(inspected.stdout).toContain("dist/gql/client/index.d.ts")
}

async function consumePublishedPackages(
  project: SyntheticProject,
  directory: string
): Promise<void> {
  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "package-consumer",
        version: "0.0.0",
        type: "module",
        packageManager: "yarn@4.11.0",
        dependencies: { graphql: "16.11.0" },
      },
      null,
      2
    )}\n`
  )
  await writeFile(join(directory, "consume.mjs"), CONSUME)
  const store = join(project.directory, ".yalc-store")
  await project.run("yarn", [
    "exec",
    `cd ${shellQuote(directory)} && yalc add ${shellQuote(
      rootName
    )} --store-folder ${shellQuote(store)}`,
  ])
  await project.run("yarn", [
    "exec",
    `cd ${shellQuote(directory)} && yalc add ${shellQuote(
      clientName
    )} --store-folder ${shellQuote(store)}`,
  ])
  await project.runAt(directory, "yarn", ["install"], 180_000)
  const consumed = await project.runAt(directory, "yarn", [
    "node",
    "consume.mjs",
  ])
  expect(consumed.stdout).toContain("consumed")
}

async function expectFile(directory: string, path: string): Promise<void> {
  try {
    const text = await readFile(join(directory, path), "utf8")
    expect(text.length).toBeGreaterThan(0)
  } catch (error) {
    const listing = [
      ...(await listRelative(directory, "dist")),
      ...(await listRelative(directory, "client/dist")),
    ]
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`missing ${path}\n${listing.join("\n")}\n${message}`)
  }
}

async function listRelative(
  directory: string,
  path: string
): Promise<string[]> {
  const root = join(directory, path)
  const found: string[] = []
  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const next = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(next)
        continue
      }
      found.push(next.slice(directory.length + 1))
    }
  }
  await walk(root)
  return found
}

async function readManifest(
  directory: string,
  path: string
): Promise<Record<string, unknown>> {
  const text = await readFile(join(directory, path), "utf8")
  return parseObject(JSON.parse(text))
}

function publishRegistry(
  manifest: Record<string, unknown>
): string | undefined {
  const publishConfig = manifest.publishConfig
  if (!isRecord(publishConfig)) return undefined
  const registry = publishConfig.registry
  return typeof registry === "string" ? registry : undefined
}

function exportImport(
  manifest: Record<string, unknown>,
  entry: string
): string | undefined {
  const condition = exportCondition(manifest, entry)
  if (condition === undefined) return undefined
  const value = condition.default
  return typeof value === "string" ? value : undefined
}

function exportTypes(
  manifest: Record<string, unknown>,
  entry: string
): string | undefined {
  const condition = exportCondition(manifest, entry)
  if (condition === undefined) return undefined
  const value = condition.types
  return typeof value === "string" ? value : undefined
}

function exportCondition(
  manifest: Record<string, unknown>,
  entry: string
): Record<string, unknown> | undefined {
  const exportsField = manifest.exports
  if (!isRecord(exportsField)) return undefined
  const target = exportsField[entry]
  if (!isRecord(target)) return undefined
  const imported = target.import
  if (!isRecord(imported)) return undefined
  return imported
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected an object")
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

const CONSUME = `import { greeting } from "@example/package-service"
import { serviceTestKit } from "@example/package-service/test"
import { Greeting } from "@example/package-service-client"

if (greeting("package") !== "Hello, package") {
  console.error("greeting mismatch")
  process.exit(1)
}
const kit = serviceTestKit()
if (!kit.schema.includes("greeting")) {
  console.error("schema mismatch")
  process.exit(1)
}
const greeted = kit.greeting({}, { name: "package" }, {}, undefined)
if (greeted !== "Hello, package") {
  console.error("kit mismatch", greeted)
  process.exit(1)
}
if (Greeting.kind !== "Document") {
  console.error("document mismatch", Greeting)
  process.exit(1)
}
console.log("consumed")
`
