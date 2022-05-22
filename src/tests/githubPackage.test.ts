import { describe, beforeAll, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"
import { spawnSync } from "child_process"

describe("the githubPackage preset", () => {
  let system: MockSystem
  beforeAll(() => {
    system = new MockSystem()
    const project = new Project({
      presetConfigs: ["githubPackage:@my-scope"],
      system,
    })
    project.confgen()
  })

  it("should tell the user they need a $NPM_PKG_TOKEN", () => {
    const { scripts } = JSON.parse(system.read("package.json")) as {
      scripts: Record<string, string>
    }

    const result = spawnSync("bash", ["-c", scripts["auth:registry"]], {
      env: {},
    })

    expect(result.stdout.toString()).toContain(
      "publishing a package to github requires a personal access token in $NPM_PKG_TOKEN"
    )
  })
})
