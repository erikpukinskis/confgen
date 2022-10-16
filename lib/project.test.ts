import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"
import { readJson } from "@/commands"

describe("project", () => {
  it("should move existing devDependencies to dependencies if needed", async () => {
    const system = new MockSystem()

    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["react", "typescript"],
      system,
    })

    system.write("package.json", {
      devDependencies: {
        react: "6.0.0",
      },
    })

    await project.confgen()

    expect(readJson("package.json", system).dependencies).toHaveProperty(
      "react",
      "6.0.0"
    )
  })
})
