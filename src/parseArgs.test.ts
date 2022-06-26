import { describe, beforeAll, it, expect, test } from "vitest"
import { parseArgs, BUILD_PATTERN, PRESET_CONFIG_PATTERN } from "@/parseArgs"

describe("parseArgs", () => {
  test("build pattern accepts a build with an @", () => {
    expect(BUILD_PATTERN.test("@server")).toBe(true)
  })

  test("preset pattern accepts a preset with args", () => {
    expect(PRESET_CONFIG_PATTERN.test("dist:app:lib")).toBe(true)
  })

  describe("with a build, a global arg, and a preset with args", () => {
    let args: ReturnType<typeof parseArgs>

    beforeAll(() => {
      args = parseArgs(["@lib", "--name", "MyLib", "dist:lib"])
    })

    it("extracts the build", () => {
      expect(args.builds).toEqual(["lib"])
    })

    it("extracts the global arg", () => {
      expect(args.globalArgs).toEqual({ name: "MyLib" })
    })

    it("extracts the preset config", () => {
      expect(args.presetConfigs).toEqual(["dist:lib"])
    })
  })

  describe("with two builds", () => {
    let args: ReturnType<typeof parseArgs>

    beforeAll(() => {
      args = parseArgs(["@app", "@server"])
    })

    it("extracts the build", () => {
      expect(args.builds).toEqual(["app", "server"])
    })
  })
})
