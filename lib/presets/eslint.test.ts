import { describe, it, expect, beforeEach } from "vitest"
import { Project } from "@/project"
import { MockSystem, type System } from "@/system"

describe("presets/eslint", () => {
  describe("without the react preset", () => {
    let system: System

    beforeEach(async () => {
      system = new MockSystem()
      const project = new Project({
        runtimes: ["app"],
        presetConfigs: ["eslint"],
        system,
      })
      await project.confgen()
    })

    it("should not have the eslint-plugin-react package", () => {
      expect(system.read("package.json")).not.toContain("eslint-plugin-react")
    })
  })

  describe("with the react preset", () => {
    let system: System

    beforeEach(async () => {
      system = new MockSystem()

      const project = new Project({
        runtimes: ["app"],
        presetConfigs: ["eslint", "react"],
        system,
      })
      await project.confgen()
    })

    it("should have the eslint-plugin-react package", () => {
      expect(system.read("package.json")).toContain("eslint-plugin-react")
    })
  })
})
