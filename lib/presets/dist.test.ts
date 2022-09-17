import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem, TestSystem } from "@/system"

describe("presets/dist", () => {
  describe("a real system", () => {
    let system: TestSystem

    beforeAll(async () => {
      system = new TestSystem({ silent: true })
      const project = new Project({
        system,
        builds: ["lib"],
        presetConfigs: ["templates", "yarn", "typescript", "vite", "dist:lib"],
        globalArgs: { name: "MyLib" },
      })
      await project.confgen()
    })

    afterAll(() => {
      system.cleanUp()
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
