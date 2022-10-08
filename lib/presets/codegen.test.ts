import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem, TestSystem } from "@/system"

const SECONDS = 1000

describe("presets/codegen", () => {
  describe("without typescript", () => {
    let project: Project

    beforeAll(() => {
      const system = new MockSystem()
      project = new Project({
        builds: ["app"],
        presetConfigs: ["codegen"],
        system,
      })
    })

    it("should throw an error", async () => {
      await expect(async () => await project.confgen()).rejects.toThrowError(
        /GraphQL codegen only makes sense in a Typescript project/
      )
    })
  })

  describe("with typescript", () => {
    let system: TestSystem

    beforeAll(async () => {
      system = new TestSystem({ silent: false })
      const project = new Project({
        builds: ["app"],
        presetConfigs: ["typescript", "codegen:lib:resolvers:schema"],
        system,
      })

      await project.confgen()
    }, 30 * SECONDS)

    afterAll(() => system.cleanUp())

    it("should write a codegen file", () => {
      expect(system.exists("codegen.yml")).toBe(true)
    })

    it("should export the schema", () => {
      system.run("yarn build:generate")
      const index = system.read("lib/__generated__/index.ts")
      expect(index).toContain('from "./schema"')
    })
  })
})
