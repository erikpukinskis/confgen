import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("presets/templates", () => {
  it("should generate a JavaScript index ", () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["lib"],
      presetConfigs: ["templates"],
      system,
    })
    project.confgen()
    expect(system.exists("lib/index.js")).toBe(true)
  })

  it("should generate a TypeScript index ", () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["lib"],
      presetConfigs: ["templates"],
      system,
    })
    project.confgen()
    expect(system.exists("lib/index.ts")).toBe(true)
  })

  it("should generate a server index ", () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["server"],
      presetConfigs: ["templates"],
      system,
    })
    project.confgen()
    expect(system.exists("server/index.js")).toBe(true)
  })

  it("should generate an index.html and JSX ", () => {
    const system = new MockSystem()
    const project = new Project({
      builds: ["app"],
      presetConfigs: ["templates"],
      system,
    })
    project.confgen()
    expect(system.exists("app/index.html")).toBe(true)
    expect(system.exists("app/index.jsx")).toBe(true)
  })
})
