import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem, RealSystem, type System } from "@/system"
import { mkdirSync, rmdirSync } from "fs"

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}

describe("presets/dist", () => {
  describe("a real system", () => {
    let system: System
    const root = `/tmp/${randomFolder()}`

    beforeAll(async () => {
      mkdirSync(root)
      system = new RealSystem({ cwd: root })
      const project = new Project({
        system,
        builds: ["lib"],
        presetConfigs: ["templates", "yarn", "typescript", "vite", "dist:lib"],
        globalArgs: { name: "MyLib" },
      })
      await project.confgen()
    })

    afterAll(() => {
      rmdirSync(root, { recursive: true })
    })

    it("can build", () => {
      expect(system.run("yarn build")).toHaveProperty("status", 0)
    })
  })

  describe("when there is already a vite build script and some unrecognized ones", () => {
    let buildScripts: string[]

    beforeAll(async () => {
      const system = new MockSystem()

      system.write("package.json", {
        scripts: {
          build: "yarn build:vite && yarn build:foo && yarn build:bar",
        },
      })

      const project = new Project({
        builds: ["lib"],
        globalArgs: { name: "MyLibrary " },
        presetConfigs: ["vite", "dist:lib"],
        system,
      })

      await project.confgen()

      const packageJson = JSON.parse(system.read("package.json")) as {
        scripts: Record<string, string>
      }
      buildScripts = packageJson.scripts.build.split(" && ")
    })

    it("should not clobber existing build commands", () => {
      expect(buildScripts).toContain("yarn build:foo")
      expect(buildScripts).toContain("yarn build:bar")
    })

    it("should not add an extra vite script", () => {
      const viteScripts = buildScripts.filter(
        (script) => script === "yarn build:vite"
      )
      expect(viteScripts).toHaveLength(1)
    })
  })
})
