import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { TestSystem } from "@/system"

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
})
