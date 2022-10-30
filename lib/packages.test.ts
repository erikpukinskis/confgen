import { describe, afterEach, it, expect, vi } from "vitest"
import * as Packages from "~/packages"
import { MockSystem, RealSystem } from "~/system"

const { packagesNeedingUpgrade, packagesToAdd } = Packages

describe("packages", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("tells us what packages need to be upgraded", () => {
    const system = new RealSystem({ silent: true })

    expect(
      packagesNeedingUpgrade(system, [
        {
          command: "yarn",
          pkg: "yaml",
          version: "^1.10.2",
        },
      ])
    ).not.toContain("yaml")

    expect(
      packagesNeedingUpgrade(system, [
        {
          command: "yarn",
          pkg: "yaml",
          version: "^1.10.3",
        },
      ])
    ).toContain("yaml")
  })

  it("excludes installed packages from packagesToAdd", () => {
    const system = new MockSystem()
    system.write("package.json", {
      dependencies: {
        react: "16.0.0",
      },
    })

    expect(
      packagesToAdd(system, [{ command: "yarn", pkg: "react" }])
    ).toHaveLength(0)
  })

  it("includes missing packages in packagesToAdd", () => {
    const system = new MockSystem()
    system.write("package.json", {})

    expect(
      packagesToAdd(system, [{ command: "yarn", pkg: "react" }])
    ).toContain("react")
  })

  it("includes versions in packagesToAdd", () => {
    const system = new MockSystem()
    system.write("package.json", {})

    expect(
      packagesToAdd(system, [
        { command: "yarn", pkg: "react", version: "^18.0.0" },
      ])
    ).toContain("react@^18.0.0")
  })

  it("includes packages that need to be upgraded packagesToAdd", () => {
    const system = new MockSystem()
    system.write("package.json", {
      dependencies: {
        react: "^16.4.1",
      },
    })

    vi.spyOn(Packages, "packagesNeedingUpgrade").mockImplementation(() => [
      "react",
    ])

    expect(
      packagesToAdd(system, [
        { command: "yarn", pkg: "react", version: "^18.0.0" },
      ])
    ).toContain("react@^18.0.0")
  })
})
