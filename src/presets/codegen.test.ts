import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("presets/codegen", () => {
  it("should throw an error without typescript", () => {
    const system = new MockSystem()
    const project = new Project({
      presetConfigs: ["codegen"],
      system,
    })

    expect(() => {
      project.confgen()
    }).toThrowError(/GraphQL codegen only makes sense in a Typescript project/)
  })
})
