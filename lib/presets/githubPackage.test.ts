import { spawnSync } from "child_process"
import { mkdirSync, rmSync, readFileSync } from "fs-extra"
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

  it("should tell the user they need a $NPM_PKG_TOKEN", () => {
    const result = spawnSync("bash", ["-c", authRegistryScript], {
      env: {},
    })

    expect(result.stdout.toString()).toContain(
      "publishing a package to github requires a personal access token in $NPM_PKG_TOKEN"
    )
  })

  describe("within a temp folder", () => {
    const root = `/tmp/${randomFolder()}`

    beforeAll(() => mkdirSync(root))

    afterAll(() => rmSync(root, { recursive: true }))

    it("should write an .npmrc", () => {
      spawnSync("bash", ["-c", authRegistryScript], {
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
