import { describe, it, expect } from "vitest"
import { formatJson } from "./format"
import { readJson } from "~/commands"
import { Project } from "~/project"
import { MockSystem } from "~/system"

describe("project", () => {
  it("should move existing devDependencies to dependencies if needed", async () => {
    const system = new MockSystem()

    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["react", "typescript"],
      system,
    })

    system.write(
      "package.json",
      await formatJson({
        devDependencies: {
          react: "6.0.0",
        },
      })
    )

    await project.confgen()

    expect(readJson("package.json", system).dependencies).toHaveProperty(
      "react",
      "6.0.0"
    )
  })
})
