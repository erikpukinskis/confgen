import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Project } from "@/project"
import { MockSystem, TestSystem } from "@/system"

describe("presets/codegen", () => {
  describe("without Typescript", () => {
    let project: Project

    beforeAll(() => {
      const system = new MockSystem()
      project = new Project({
        runtimes: ["app"],
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

  describe("in a mock system", () => {
    let project: Project
    let system: MockSystem

    beforeAll(() => {
      system = new MockSystem()
      project = new Project({
        runtimes: ["app"],
        presetConfigs: ["typescript", "codegen:lib:resolvers:schema"],
        system,
      })
    })

    it("should properly quote the afterAllFileWrite", async () => {
      await project.confgen()
      const yaml = system.read("codegen.yml")
      expect(yaml).toMatch("hook")
    })
  })

  describe("with Typescript in a real system", () => {
    let system: TestSystem

    beforeAll(async () => {
      system = new TestSystem()
      const project = new Project({
        runtimes: ["app"],
        presetConfigs: ["typescript", "codegen:lib:resolvers:schema"],
        system,
      })

      await project.confgen()
    }, 90 * 1000)

    afterAll(() => system.cleanUp())

    it("should write a codegen file", () => {
      expect(system.exists("codegen.yml")).toBe(true)
    })

    it("should export the schema", () => {
      system.run("yarn build:generate")
      const index = system.read("lib/gql/index.ts")
      expect(index).toContain('from "./schema"')
    })
  })
})
