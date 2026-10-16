import { cp, mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createSyntheticProject,
  packConfgen,
  packPackageService,
  readScenario,
  type PackedConfgen,
  type PackedPackageService,
  type SyntheticProject,
} from "./helpers.js"
import { expect, test } from "vitest"

const fixture = fileURLToPath(
  new URL("./fixtures/schema-service/", import.meta.url)
)

test(
  "the synthetic schema service composes the packed Package Service packages",
  { timeout: 1_500_000 },
  async () => {
    let confgen: PackedConfgen | undefined
    let packageService: PackedPackageService | undefined
    let project: SyntheticProject | undefined
    try {
      confgen = await packConfgen()
      packageService = await packPackageService()
      project = await createSyntheticProject({ tarball: confgen.tarball, fixture })
      const packageDirectory = join(project.directory, ".yalc")
      await mkdir(packageDirectory, { recursive: true })
      await cp(
        packageService.rootTarball,
        join(packageDirectory, "package-service.tgz")
      )
      await cp(
        packageService.clientTarball,
        join(packageDirectory, "package-service-client.tgz")
      )
      await project.run("yarn", [
        "add",
        "@multiplayerdb/package-service@file:.yalc/package-service.tgz",
        "@multiplayerdb/package-service-client@file:.yalc/package-service-client.tgz",
      ])

      await project.run("yarn", ["confgen", ...(await readScenario(fixture))])
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
        bcrypt: { unplugged: true },
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
      await project.run("yarn", ["confgen"])
      const status = await project.run("git", ["status", "--porcelain"])
      expect(status.stdout).toBe("")
    } finally {
      await project?.cleanup()
      await packageService?.cleanup()
      await confgen?.cleanup()
    }
  }
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
