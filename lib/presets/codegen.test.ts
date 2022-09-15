import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("presets/codegen", () => {
  it("should throw an error without typescript", async () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["app"],
      presetConfigs: ["codegen"],
      system,
    })

    await expect(async () => await project.confgen()).rejects.toThrowError(
      /GraphQL codegen only makes sense in a Typescript project/
    )
  })

  it("should write a codegen file", async () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["app"],
      presetConfigs: ["typescript", "codegen:lib:resolvers:schema"],
      system,
    })

    await project.confgen()

    expect(system.exists("codegen.yml")).toBe(true)
  })
})
