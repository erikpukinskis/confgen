import { describe, it, expect, beforeEach } from "vitest"
import { Project } from "../project"
import { MockSystem, type System } from "../system"

describe("the eslint preset", () => {
  let project: Project
  let system: System

  beforeEach(() => {
    system = new MockSystem()
    project = new Project({
      presetNames: ["eslint"],
      argsByPresetName: {},
      system,
    })
    project.confgen()
  })

  it("should not have the eslint-plugin-react package", () => {
    expect(system.read("package.json")).not.toContain("eslint-plugin-react")
  })

  describe("plus the react preset", () => {
    beforeEach(() => {
      project = new Project({
        presetNames: ["eslint", "react"],
        argsByPresetName: {},
        system,
      })
      project.confgen()
    })

    it("should have the eslint-plugin-react package", () => {
      expect(system.read("package.json")).toContain("eslint-plugin-react")
    })
  })
})
