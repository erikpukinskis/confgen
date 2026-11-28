import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createSystem, type System } from "../lib/system"
import { confgenExecutable, copyFixture } from "./helpers"
import { expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/package-service/", import.meta.url),
)
const rootName = "@example/package-service"
const clientName = "@example/package-service-client"

test("the package service test verifies confgen behavior for an empty project", async () => {
  const args = [
    "runtimes=#lib:node:test-kit,#server,#client,#integration,#gateway",
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
  ]
  const directory = await copyFixture(fixture)
  const project = createSystem(directory)
  const consumerDirectory = await mkdtemp(join(tmpdir(), "confgen-consumer-"))
  const sslDirectory = await mkdtemp(join(tmpdir(), "confgen-ssl-"))
  const composeProject = `confgen-package-${process.pid}`
  const composeEnv = {
    COMPOSE_PROJECT_NAME: composeProject,
    IMAGE_TAG: "test",
    SSL_PATH: sslDirectory,
    PACKAGE_SERVICE_URL: "https://package-service.local.multiplayerdb.dev",
    DEV_CLUSTER_HTTP_PORT: "18080",
    DEV_CLUSTER_HTTPS_PORT: "18443",
  }
  try {
    await project.run(confgenExecutable, args).waitForExit()
    await project.run("yarn", ["install"]).waitForExit()
    await project
      .run("yarn", ["generate:local:ssl"], { env: { SSL_PATH: sslDirectory } })
      .waitForExit()
    const server = project.run("yarn", ["start:server"], {
      env: { PORT: "3017", SSL_PATH: sslDirectory },
    })
    for (;;) {
      const line = await server.next()
      if (line.stdout?.includes("ready https://127.0.0.1:")) break
      if (line.status !== undefined) {
        throw new Error(`server exited before it was ready\n${server.stdout}`)
      }
    }
    const health = await project
      .run("curl", [
        "--fail",
        "--silent",
        "--cacert",
        join(sslDirectory, "local.multiplayerdb.dev.crt"),
        "--resolve",
        "package-service.local.multiplayerdb.dev:3017:127.0.0.1",
        "https://package-service.local.multiplayerdb.dev:3017/healthcheck",
      ])
      .waitForExit()
    expect(health.stdout).toContain("ok")
    await server.stop()
    await expectRuntimeScopes(directory)
    await proveContainer(project, directory, composeEnv)
    await project
      .run("yarn", ["test:integration:local"], { env: composeEnv })
      .waitForExit()
    await project.run("yarn", ["build:generate"]).waitForExit()
    await project.run("yarn", ["build:lib"]).waitForExit()
    await project.run("yarn", ["build:server"]).waitForExit()
    await project.run("yarn", ["build:client"]).waitForExit()
    await project.run("yarn", ["check:types"]).waitForExit()
    await project.run("yarn", ["check:lint"]).waitForExit()
    await project.run("yarn", ["fix:format"]).waitForExit()
    await project.run("yarn", ["check:format"]).waitForExit()
    await project.run("yarn", ["test"]).waitForExit()
    await expectPublishedPackages(project, directory)
    await proveReleaseCommands(project, directory)
    await project.run("yarn", ["yalc:publish"]).waitForExit()
    await consumePublishedPackages(project, directory, consumerDirectory)
    await project.run("git", ["init"]).waitForExit()
    await project.run("git", ["add", "--all"]).waitForExit()
    await project
      .run("git", [
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
      .waitForExit()
    const bumped = await project
      .run("yarn", ["bump-n-pub", "patch", "--bump-only", "--dry-run"])
      .waitForExit()
    expect(bumped.stdout).toContain("Version would be 0.1.1")
    await project.run(confgenExecutable, args).waitForExit()
    const status = await project
      .run("git", ["status", "--porcelain"])
      .waitForExit()
    expect(status.stdout).toBe("")
  } finally {
    await stopContainers(project, composeEnv)
  }
})

async function proveReleaseCommands(
  project: System,
  directory: string,
): Promise<void> {
  await project.run("yarn", ["bump-n-pub", "check-registries"]).waitForExit()
  await project.run("yarn", ["bump-n-pub", "check-pack"]).waitForExit()
  const rootPath = join(directory, "package.json")
  const clientPath = join(directory, "client/package.json")
  const rootOriginal = await readFile(rootPath, "utf8")
  const clientOriginal = await readFile(clientPath, "utf8")
  const server = createServer((request, response) => {
    void request
    response.writeHead(404, { "content-type": "application/json" })
    response.end(JSON.stringify({ error: "Not found" }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  try {
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("missing registry port")
    }
    const registry = `http://127.0.0.1:${address.port}`
    await writeRegistry(rootPath, registry)
    await writeRegistry(clientPath, registry)
    const prepared = await project
      .run("yarn", ["bump-n-pub", "prepare"], {
        env: {
          GITHUB_REF_NAME: "main",
          PUBLISHING_BRANCHES: '["main"]',
        },
      })
      .waitForExit()
    expect(prepared.stdout).toContain("package_version=0.1.0")
    expect(prepared.stdout).toContain("should_publish=true")
  } finally {
    await writeFile(rootPath, rootOriginal)
    await writeFile(clientPath, clientOriginal)
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    })
  }
}

async function writeRegistry(path: string, registry: string): Promise<void> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"))
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  const publishConfig = isRecord(value.publishConfig) ? value.publishConfig : {}
  const next = {
    ...value,
    publishConfig: { ...publishConfig, registry },
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`)
}

async function proveContainer(
  project: System,
  directory: string,
  env: Readonly<Record<string, string>>,
): Promise<void> {
  const docker = (args: readonly string[]) =>
    project.run("docker", args, { env }).waitForExit()
  const configured = await docker([
    "compose",
    "-f",
    "compose.base.yaml",
    "-f",
    "compose.local.yaml",
    "config",
  ])
  expect(configured.stdout).toContain("package-api-server")
  expect(configured.stdout).toContain("target: dev")
  expect(configured.stdout).toContain("/healthcheck")
  expect(configured.stdout).toContain("package-service-integration-test-host")
  expect(configured.stdout).toContain("target: integration-test-host")
  expect(configured.stdout).toContain("dockerfile: ./gateway/Dockerfile")
  const base = await docker(["compose", "-f", "compose.base.yaml", "config"])
  expect(base.stdout).toContain("ghcr.io/example/package-api-server:test")
  expect(base.stdout).toContain("ghcr.io/example/package-service:test")
  expect(base.stdout).not.toContain("target: dev")
  expect(base.stdout).toContain(
    "ghcr.io/example/package-service-integration-test-host:test",
  )
  expect(base.stdout).not.toContain("/mnt/package-service")
  const manifest = await readManifest(directory, "package.json")
  expect(scriptCommand(manifest, "test:integration:ci")).toBe(
    "docker compose -f compose.base.yaml up --attach-dependencies --exit-code-from package-service-integration-test-host package-service-integration-test-host",
  )

  await docker([
    "build",
    "--target",
    "prod",
    "-t",
    "ghcr.io/example/package-api-server:test",
    ".",
  ])
  await docker([
    "build",
    "-f",
    "gateway/Dockerfile",
    "-t",
    "ghcr.io/example/package-service:test",
    ".",
  ])
  try {
    await docker([
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
      "package-service",
    ])
    const listed = await docker([
      "compose",
      "-f",
      "compose.base.yaml",
      "ps",
      "-q",
      "package-api-server",
    ])
    const containerId = listed.stdout.trim()
    const health = await docker([
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      containerId,
    ])
    expect(health.stdout.trim()).toBe("healthy")
    const response = await docker([
      "compose",
      "-f",
      "compose.base.yaml",
      "exec",
      "-T",
      "package-api-server",
      "curl",
      "--fail",
      "--silent",
      "https://package-api-server.local.multiplayerdb.dev:7001/",
    ])
    expect(response.stdout).toContain("Hello, baseline")
    const check = await docker([
      "compose",
      "-f",
      "compose.base.yaml",
      "exec",
      "-T",
      "package-api-server",
      "curl",
      "--fail",
      "--silent",
      "https://package-api-server.local.multiplayerdb.dev:7001/healthcheck",
    ])
    expect(check.stdout).toContain("ok")
    const gatewayHealth = await docker([
      "compose",
      "-f",
      "compose.base.yaml",
      "exec",
      "-T",
      "package-service",
      "curl",
      "--fail",
      "--silent",
      "https://package-service.local.multiplayerdb.dev/healthcheck",
    ])
    expect(gatewayHealth.stdout).toContain("ok")
    const proxied = await docker([
      "compose",
      "-f",
      "compose.base.yaml",
      "exec",
      "-T",
      "package-service",
      "curl",
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--header",
      "Content-Type: application/json",
      "--data",
      JSON.stringify({ query: '{ greeting(name: "baseline") }' }),
      "https://package-service.local.multiplayerdb.dev/api",
    ])
    expect(proxied.stdout).toContain("Hello, baseline")
  } finally {
    await stopContainers(project, env)
  }
}

async function stopContainers(
  project: System,
  env: Readonly<Record<string, string>>,
): Promise<void> {
  try {
    await project.run("yarn", ["stop:containers:local"], { env }).waitForExit()
  } catch {
    // The local project may not be up.
  }
  try {
    await project
      .run(
        "docker",
        [
          "compose",
          "-f",
          "compose.base.yaml",
          "down",
          "-v",
          "--remove-orphans",
        ],
        { env },
      )
      .waitForExit()
  } catch {
    // The service may not have started.
  }
}

async function expectRuntimeScopes(directory: string): Promise<void> {
  await expectFile(directory, ".env.example")
  await expectFile(directory, "integration/service.test.ts")
  await expectFile(directory, "gateway/httpd.conf")
  await expectFile(directory, "gateway/public/index.html")
  await expectFile(directory, "gateway/Dockerfile")
  const tsconfig = parseObject(
    JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")),
  )
  expect(stringList(tsconfig.include)).toEqual(
    expect.arrayContaining(["integration/**/*.ts", "gateway/**/*.ts"]),
  )
  const unit = await readFile(join(directory, "vite.test.config.ts"), "utf8")
  expect(unit).not.toContain("integration/**/*.test.ts")
  const focused = await readFile(
    join(directory, "vite.integration.config.ts"),
    "utf8",
  )
  expect(focused).toContain("integration/**/*.test.ts")
  const manifest = await readManifest(directory, "package.json")
  expect(scriptCommand(manifest, "check:types")).toContain("tsconfig.json")
  expect(scriptCommand(manifest, "build")).toContain("yarn build:server")
  expect(scriptCommand(manifest, "test:integration:run")).toBe(
    "vitest run --config vite.integration.config.ts",
  )
  expect(scriptCommand(manifest, "test:integration:local")).toBe(
    "docker compose -f compose.base.yaml -f compose.local.yaml up --build --abort-on-container-exit --attach-dependencies package-service-integration-test-host",
  )
  expect(scriptCommand(manifest, "test:integration:ci")).toBe(
    "docker compose -f compose.base.yaml up --attach-dependencies --exit-code-from package-service-integration-test-host package-service-integration-test-host",
  )
}

function scriptCommand(
  manifest: Record<string, unknown>,
  name: string,
): string {
  const scripts = manifest.scripts
  if (!isRecord(scripts)) throw new Error("missing scripts")
  const command = scripts[name]
  if (typeof command !== "string") throw new Error(`missing script ${name}`)
  return command
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("expected a list")
  const result: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string") throw new Error("expected a string list")
    result.push(entry)
  }
  return result
}

async function expectPublishedPackages(
  project: System,
  directory: string,
): Promise<void> {
  await expectFile(directory, "dist/lib/index.js")
  await expectFile(directory, "dist/lib/index.d.ts")
  await expectFile(directory, "dist/lib/test-kit.js")
  await expectFile(directory, "dist/lib/test-kit.d.ts")
  await expectFile(directory, "client/dist/index.js")
  await expectFile(directory, "client/dist/client/index.d.ts")
  const rootManifest = await readManifest(directory, "package.json")
  expect(rootManifest.name).toBe(rootName)
  expect(rootManifest.type).toBe("module")
  expect(publishRegistry(rootManifest)).toBe("https://npm.example.test")
  expect(exportImport(rootManifest, ".")).toBe("./dist/lib/index.js")
  expect(exportTypes(rootManifest, ".")).toBe("./dist/lib/index.d.ts")
  expect(exportImport(rootManifest, "./test-kit")).toBe(
    "./dist/lib/test-kit.js",
  )
  expect(exportTypes(rootManifest, "./test-kit")).toBe(
    "./dist/lib/test-kit.d.ts",
  )
  expect(exportImport(rootManifest, "./test")).toBeUndefined()
  const testKitSource = await readFile(
    join(directory, "dist/lib/test-kit.js"),
    "utf8",
  )
  expect(testKitSource).toMatch(/from ["']graphql-dev-kit\/test["']/)
  const clientManifest = await readManifest(directory, "client/package.json")
  expect(clientManifest.name).toBe(clientName)
  expect(clientManifest.version).toBe(rootManifest.version)
  expect(clientManifest.type).toBe("module")
  expect(publishRegistry(clientManifest)).toBe("https://npm.example.test")
  expect(exportImport(clientManifest, ".")).toBe("./dist/index.js")
  expect(exportTypes(clientManifest, ".")).toBe("./dist/client/index.d.ts")
  expect(clientManifest.imports).toBeUndefined()
  const inspected = await project.run("yarn", ["inspect:pack"]).waitForExit()
  expect(inspected.stdout).toContain("dist/lib/index.js")
  expect(inspected.stdout).toContain("dist/lib/index.d.ts")
  expect(inspected.stdout).toContain("dist/lib/test-kit.js")
  expect(inspected.stdout).toContain("dist/client/index.d.ts")
  expect(inspected.stdout).toContain("dist/gql/client/index.d.ts")
}

async function consumePublishedPackages(
  project: System,
  projectDirectory: string,
  consumerDirectory: string,
): Promise<void> {
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "package-consumer",
        version: "0.0.0",
        type: "module",
        packageManager: "yarn@4.18.1",
        dependencies: { graphql: "16.11.0" },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(join(consumerDirectory, "consume.mjs"), CONSUME)
  const store = join(projectDirectory, ".yalc-store")
  await project
    .run("yarn", [
      "exec",
      `cd ${shellQuote(consumerDirectory)} && yalc add ${shellQuote(
        rootName,
      )} --store-folder ${shellQuote(store)}`,
    ])
    .waitForExit()
  await project
    .run("yarn", [
      "exec",
      `cd ${shellQuote(consumerDirectory)} && yalc add ${shellQuote(
        clientName,
      )} --store-folder ${shellQuote(store)}`,
    ])
    .waitForExit()
  await project
    .run("yarn", ["install"], { cwd: consumerDirectory })
    .waitForExit()
  const consumed = await project
    .run("yarn", ["node", "consume.mjs"], { cwd: consumerDirectory })
    .waitForExit()
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
  path: string,
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
  path: string,
): Promise<Record<string, unknown>> {
  const text = await readFile(join(directory, path), "utf8")
  return parseObject(JSON.parse(text))
}

function publishRegistry(
  manifest: Record<string, unknown>,
): string | undefined {
  const publishConfig = manifest.publishConfig
  if (!isRecord(publishConfig)) return undefined
  const registry = publishConfig.registry
  return typeof registry === "string" ? registry : undefined
}

function exportImport(
  manifest: Record<string, unknown>,
  entry: string,
): string | undefined {
  const condition = exportCondition(manifest, entry)
  if (condition === undefined) return undefined
  const value = condition.default
  return typeof value === "string" ? value : undefined
}

function exportTypes(
  manifest: Record<string, unknown>,
  entry: string,
): string | undefined {
  const condition = exportCondition(manifest, entry)
  if (condition === undefined) return undefined
  const value = condition.types
  return typeof value === "string" ? value : undefined
}

function exportCondition(
  manifest: Record<string, unknown>,
  entry: string,
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
import { createPackageServiceTestKit } from "@example/package-service/test-kit"
import { Greeting } from "@example/package-service-client"

if (greeting("package") !== "Hello, package") {
  console.error("greeting mismatch")
  process.exit(1)
}
const kit = await createPackageServiceTestKit()
const data = await kit.operations.query(Greeting, { name: "package" })
if (data.greeting !== "Hello, package") {
  throw new Error("greeting operation did not return the expected result")
}
console.log("consumed")
`
