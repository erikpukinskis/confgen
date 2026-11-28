import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createSystem } from "../lib/system"
import { confgenExecutable, copyFixture, packPackageService } from "./helpers"
import { expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/schema-service/", import.meta.url),
)
const consumerFixture = fileURLToPath(
  new URL("./fixtures/schema-consumer/", import.meta.url),
)

test("the Schema Service fixture verifies confgen re-runs", async () => {
  const packageService = await packPackageService()
  const directory = await copyFixture(fixture)
  const project = createSystem(directory)
  await project
    .run("yarn", [
      "add",
      `@multiplayerdb/package-service@file:${packageService.rootTarball}`,
      `@multiplayerdb/package-service-client@file:${packageService.clientTarball}`,
    ])
    .waitForExit()

  await project.run("yarn", ["all", "the", "things!"]).waitForExit()

  const selection = [
    "runtimes=#lib:node:test-kit,#server,#client,#integration",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "prettier",
    "graphql",
    "docker",
    "sql",
  ]

  await project.run(confgenExecutable, selection).waitForExit()
  await project.run("yarn", ["install", "--immutable"]).waitForExit()
  await project.run("yarn", ["build:generate"]).waitForExit()
  await project.run("yarn", ["build"]).waitForExit()
  await project.run("yarn", ["check:types"]).waitForExit()
  await project.run("yarn", ["test"]).waitForExit()

  const packed = await mkdtemp(join(tmpdir(), "confgen-schema-pack-"))
  const tarball = join(packed, "schema-service.tgz")
  const clientTarball = join(packed, "schema-service-client.tgz")
  const testKitSource = await readFile(
    join(directory, "dist/lib/test-kit.js"),
    "utf8",
  )
  expect(testKitSource).toMatch(/from ["']graphql-dev-kit\/test["']/)
  await project.run("yarn", ["pack", "--out", tarball]).waitForExit()
  await project
    .run("yarn", [
      "workspace",
      "@example/schema-service-client",
      "pack",
      "--out",
      clientTarball,
    ])
    .waitForExit()
  await removeGenerated(consumerFixture)
  const consumer = createSystem(await copyFixture(consumerFixture))
  await consumer
    .run("yarn", [
      "add",
      `@example/schema-service@file:${tarball}`,
      `@example/schema-service-client@file:${clientTarball}`,
    ])
    .waitForExit()
  await consumer.run("yarn", ["tsc", "-p", "tsconfig.json"]).waitForExit()
  const consumed = await consumer.run("node", ["dist/consume.js"]).waitForExit()
  expect(consumed.stdout).toContain("consumed")

  const manifest: unknown = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  )
  if (!isRecord(manifest)) throw new Error("package.json must be an object")
  expect(manifest.dependenciesMeta).toMatchObject({
    "@multiplayerdb/package-service": { unplugged: true },
    "bcrypt": { unplugged: true },
    "sql.js": { unplugged: true },
  })
  const baseCompose = await readFile(
    join(directory, "compose.base.yaml"),
    "utf8",
  )
  expect(baseCompose).toContain("${PACKAGE_SERVICE_PATH:?}/compose.base.yaml")
  expect(baseCompose).toContain("PACKAGE_SERVICE_URL")
  expect(baseCompose).toContain("package-service:")
  const resolvers = await readFile(
    join(directory, "gql/_generated/resolvers.ts"),
    "utf8",
  )
  expect(resolvers).toContain("ResolverContext")

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
      "synthetic schema service",
    ])
    .waitForExit()
  await project.run(confgenExecutable, selection).waitForExit()
  const status = await project
    .run("git", ["status", "--porcelain"])
    .waitForExit()
  expect(status.stdout).toBe("")
})

/** Removes install and compile output so the fixture copy contains only source. */
async function removeGenerated(directory: string): Promise<void> {
  await Promise.all(
    [
      "node_modules",
      "dist",
      ".yarn",
      ".pnp.cjs",
      ".pnp.loader.mjs",
      "yarn.lock",
    ].map((entry) =>
      rm(join(directory, entry), { recursive: true, force: true }),
    ),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
