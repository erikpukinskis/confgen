import { describe, it, expect } from "vitest"
import { Project } from "@/project"
import { MockSystem } from "@/system"

describe("presets/templates", () => {
  it.skip("should generate a JavaScript index ", async () => {
    const system = new MockSystem()
    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["templates"],
      system,
    })
    await project.confgen()
    expect(system.exists("lib/index.js")).toBe(true)
  })

  it.skip("should generate a TypeScript index ", async () => {
    const system = new MockSystem()
    const project = new Project({
      runtimes: ["lib"],
      presetConfigs: ["templates"],
      system,
    })
    await project.confgen()
    expect(system.exists("lib/index.ts")).toBe(true)
  })

  it.skip("should generate a server index ", async () => {
    const system = new MockSystem()
    const project = new Project({
      runtimes: ["server"],
      presetConfigs: ["templates"],
      system,
    })
    await project.confgen()
    expect(system.exists("server/index.js")).toBe(true)
  })

  it.skip("should generate an index.html and JSX ", async () => {
    const system = new MockSystem()
    const project = new Project({
      runtimes: ["app"],
      presetConfigs: ["templates"],
      system,
    })
    await project.confgen()
    expect(system.exists("app/index.html")).toBe(true)
    expect(system.exists("app/index.jsx")).toBe(true)
  })
})
