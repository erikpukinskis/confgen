import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("presets/vitest", () => {
  it("should write an index.test.ts file if there are no tests present", async () => {
    const system = new MockSystem()
    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["vitest", "typescript"],
      system,
    })

    await project.confgen()

    expect(system.exists("lib/index.test.ts")).toBe(true)
  })
})
