import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  confgenExecutable,
  createSyntheticProject,
  packPackageService,
  type PackedPackageService,
  type SyntheticProject,
} from "./helpers"
import { expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/schema-service/", import.meta.url),
)
const consumerFixture = fileURLToPath(
  new URL("./fixtures/schema-consumer/", import.meta.url),
)

test(
  "the Schema Service fixture verifies confgen re-runs",
  { timeout: 1_500_000 },
  async () => {
    let packageService: PackedPackageService | undefined
    let project: SyntheticProject | undefined
    let consumer: SyntheticProject | undefined
    let packed: string | undefined
    try {
      packageService = await packPackageService()
      project = await createSyntheticProject(fixture)
      await project.run("yarn", [
        "add",
        `@multiplayerdb/package-service@file:${packageService.rootTarball}`,
        `@multiplayerdb/package-service-client@file:${packageService.clientTarball}`,
      ])

      await project.run("yarn", ["all", "the", "things!"], 180_000)

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

      await project.run(confgenExecutable, selection)
      await project.run("yarn", ["install", "--immutable"])
      await project.run("yarn", ["build:generate"])
      await project.run("yarn", ["build"])
      await project.run("yarn", ["check:types"])
      await project.run("yarn", ["test"])

      packed = await mkdtemp(join(tmpdir(), "confgen-schema-pack-"))
      const tarball = join(packed, "schema-service.tgz")
      const clientTarball = join(packed, "schema-service-client.tgz")
      const testKitSource = await readFile(
        join(project.directory, "dist/lib/test-kit.js"),
        "utf8",
      )
      expect(testKitSource).toMatch(/from ["']graphql-dev-kit\/test["']/)
      await project.run("yarn", ["pack", "--out", tarball], 180_000)
      await project.run(
        "yarn",
        [
          "workspace",
          "@example/schema-service-client",
          "pack",
          "--out",
          clientTarball,
        ],
        180_000,
      )
      await removeGenerated(consumerFixture)
      consumer = await createSyntheticProject(consumerFixture)
      await consumer.run(
        "yarn",
        [
          "add",
          `@example/schema-service@file:${tarball}`,
          `@example/schema-service-client@file:${clientTarball}`,
        ],
        180_000,
      )
      await consumer.run("yarn", ["tsc", "-p", "tsconfig.json"])
      const consumed = await consumer.run("node", ["dist/consume.js"])
      expect(consumed.stdout).toContain("consumed")

      const manifest: unknown = JSON.parse(
        await readFile(join(project.directory, "package.json"), "utf8"),
      )
      if (!isRecord(manifest)) throw new Error("package.json must be an object")
      expect(manifest.dependenciesMeta).toMatchObject({
        "@multiplayerdb/package-service": { unplugged: true },
        "bcrypt": { unplugged: true },
        "sql.js": { unplugged: true },
      })
      const baseCompose = await readFile(
        join(project.directory, "compose.base.yaml"),
        "utf8",
      )
      expect(baseCompose).toContain(
        "${PACKAGE_SERVICE_PATH:?}/compose.base.yaml",
      )
      expect(baseCompose).toContain("PACKAGE_SERVICE_URL")
      expect(baseCompose).toContain("package-service:")
      const resolvers = await readFile(
        join(project.directory, "gql/_generated/resolvers.ts"),
        "utf8",
      )
      expect(resolvers).toContain("ResolverContext")

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
        "synthetic schema service",
      ])
      await project.run(confgenExecutable, selection)
      const status = await project.run("git", ["status", "--porcelain"])
      expect(status.stdout).toBe("")
    } finally {
      await consumer?.cleanup()
      if (packed !== undefined) {
        await rm(packed, { recursive: true, force: true })
      }
      await project?.cleanup()
      await packageService?.cleanup()
    }
  },
)

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
