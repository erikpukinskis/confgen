import { describe, it, expect } from "vitest"
import { sortPackageJson } from "./sortPackageJson"

describe("sortPackageJson", () => {
  it("should sort dependencies", async () => {
    const packageJson = {
      dependencies: {
        beta: "0.0.1",
        alpha: "0.0.0",
      },
    }

    expect(await sortPackageJson(packageJson)).toEqual(`{
  "dependencies": {
    "alpha": "0.0.0",
    "beta": "0.0.1"
  }
}
`)
  })

  it("should sort top level keys", async () => {
    const packageJson = {
      version: "0.0.0",
      name: "alpha",
    }

    expect(await sortPackageJson(packageJson)).toEqual(`{
  "name": "alpha",
  "version": "0.0.0"
}
`)
  })
})
