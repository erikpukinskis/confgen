import { cp, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createSystem } from "../lib/system"
import { z } from "zod"

export const confgenExecutable = fileURLToPath(
  new URL("../dist/index.js", import.meta.url),
)
const packageServiceRoot = fileURLToPath(
  new URL("../../package-service/", import.meta.url),
)

export type PackedPackageService = {
  rootTarball: string
  clientTarball: string
}

/** Builds and packs the exact root and client artifacts used by consumers. */
export async function packPackageService(): Promise<PackedPackageService> {
  const directory = await mkdtemp(join(tmpdir(), "package-service-pack-"))
  const rootTarball = join(directory, "package-service.tgz")
  const clientTarball = join(directory, "package-service-client.tgz")
  const system = createSystem(packageServiceRoot)
  await system.run("yarn", ["build"]).waitForExit()
  await system.run("yarn", ["pack", "--out", rootTarball]).waitForExit()
  await system
    .run("yarn", [
      "workspace",
      "@multiplayerdb/package-service-client",
      "pack",
      "--out",
      clientTarball,
    ])
    .waitForExit()
  return { rootTarball, clientTarball }
}

/** Copies a fixture into a temporary directory and returns its path. */
export async function copyFixture(fixture: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "confgen-synthetic-"))
  await cp(fixture, directory, { recursive: true })
  return directory
}

/** Port announced by the generated server's readiness line. */
export function readyPort(stdout: string): number {
  const matched = /ready http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout)
  const digits = matched?.[1]
  if (digits === undefined) {
    throw new Error(`missing readiness port\n${stdout}`)
  }
  return z.number().int().nonnegative().max(65535).parse(Number(digits))
}
