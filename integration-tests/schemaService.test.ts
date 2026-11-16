import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  confgenExecutable,
  createSyntheticProject,
  packDevCluster,
  packPackageService,
  type PackedPackageService,
  type PackedTool,
  type SyntheticProject,
} from "./helpers"
import { expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/schema-service/", import.meta.url)
)

test(
  "the synthetic schema service composes the packed Package Service packages",
  { timeout: 1_500_000 },
  async () => {
    let devCluster: PackedTool | undefined
    let packageService: PackedPackageService | undefined
    let project: SyntheticProject | undefined
    try {
      packageService = await packPackageService()
      devCluster = await packDevCluster()
      project = await createSyntheticProject(fixture)
      const devClusterDirectory = join(project.directory, ".yalc/dev-cluster")
      await mkdir(devClusterDirectory, { recursive: true })
      await project.run("tar", [
        "-xzf",
        devCluster.tarball,
        "-C",
        devClusterDirectory,
        "--strip-components=1",
      ])
      await project.run("yarn", [
        "add",
        `@multiplayerdb/package-service@file:${packageService.rootTarball}`,
        `@multiplayerdb/package-service-client@file:${packageService.clientTarball}`,
      ])

      await project.run("yarn", ["all", "the", "things!"], 180_000)

      const selection = [
        "runtimes=#lib,#server,#client,#integration",
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

      const manifest: unknown = JSON.parse(
        await readFile(join(project.directory, "package.json"), "utf8")
      )
      if (!isRecord(manifest)) throw new Error("package.json must be an object")
      expect(manifest.dependenciesMeta).toMatchObject({
        "@multiplayerdb/package-service": { unplugged: true },
        "bcrypt": { unplugged: true },
        "sql.js": { unplugged: true },
      })
      const baseCompose = await readFile(
        join(project.directory, "compose.base.yaml"),
        "utf8"
      )
      expect(baseCompose).toContain(
        "${PACKAGE_SERVICE_PATH:?}/compose.base.yaml"
      )
      expect(baseCompose).toContain("PACKAGE_SERVICE_URL")
      expect(baseCompose).toContain("package-service:")
      const resolvers = await readFile(
        join(project.directory, "gql/_generated/resolvers.ts"),
        "utf8"
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
      await project?.cleanup()
      await packageService?.cleanup()
      await devCluster?.cleanup()
    }
  }
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
