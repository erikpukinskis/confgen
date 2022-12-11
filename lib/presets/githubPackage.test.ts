import { spawnSync } from "child_process"
import { mkdirSync, rmSync, readFileSync, existsSync } from "fs-extra"
import { describe, beforeAll, it, expect, afterAll } from "vitest"
import { Project } from "~/project"
import { MockSystem } from "~/system"

describe("presets/githubPackage", () => {
  let system: MockSystem
  let authRegistryScript: string

  beforeAll(async () => {
    system = new MockSystem()
    system.write(".gitignore", "foo\n")
    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["githubPackage:@my-scope"],
      system,
    })
    await project.confgen()

    const { scripts } = JSON.parse(system.read("package.json")) as {
      scripts: Record<string, string>
    }

    authRegistryScript = scripts["auth:registry"]
  })

  it("should put .npmrc in the .gitignore", () => {
    expect(system.read(".gitignore")).toContain(".npmrc")
    expect(system.read(".gitignore")).toContain("foo")
  })

  describe("within a temp folder", () => {
    const root = `/tmp/${randomFolder()}`

    beforeAll(() => {
      console.log("Running githubPackage test in", root)
      mkdirSync(root)
    })

    afterAll(() => rmSync(root, { recursive: true }))

    it("should tell the user they need a $NPM_PKG_TOKEN", () => {
      expect(existsSync(`${root}/.npmrc`)).toBe(false)
      console.log(authRegistryScript)

      const result = spawnSync("bash", ["--norc", "-c", authRegistryScript], {
        env: {},
        cwd: root,
      })

      expect(result.stdout.toString()).toContain(
        "publishing a package to github requires a personal access token in $NPM_PKG_TOKEN"
      )
    })

    it("should write an .npmrc", () => {
      spawnSync("bash", ["--norc", "-c", authRegistryScript], {
        cwd: root,
        env: { NPM_PKG_TOKEN: "t0k3n" },
      })

      const npmrc = readFileSync(`${root}/.npmrc`).toString()

      expect(npmrc).toContain("t0k3n")
    })
  })
})

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}
