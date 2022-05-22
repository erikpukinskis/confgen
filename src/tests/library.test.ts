import { describe, it, expect, beforeAll } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("the library preset", () => {
  describe("when there is already a vite build script and some unrecognized ones", () => {
    let buildScripts: string[]

    beforeAll(() => {
      const system = new MockSystem()
      system.write("package.json", {
        scripts: {
          build: "yarn build:vite && yarn build:foo && yarn build:bar",
        },
      })

      const project = new Project({
        presetConfigs: ["vite", "library:MyLibrary"],
        system,
      })

      project.confgen()

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
