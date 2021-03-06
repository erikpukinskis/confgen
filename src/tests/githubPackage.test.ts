import { describe, beforeAll, it, expect, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"
import { spawnSync } from "child_process"
import { mkdirSync, rmdirSync, readFileSync } from "fs-extra"

describe("presets/githubPackage", () => {
  let system: MockSystem
  let authRegistryScript: string

  beforeAll(() => {
    system = new MockSystem()
    system.write(".gitignore", "foo\n")
    const project = new Project({
      presetConfigs: ["githubPackage:@my-scope"],
      system,
    })
    project.confgen()

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
    console.log(root)

    beforeAll(() => mkdirSync(root))

    afterAll(() => rmdirSync(root, { recursive: true }))

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
