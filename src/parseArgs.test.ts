import { describe, beforeAll, it, expect } from "vitest"
import { parseArgs } from "@/parseArgs"

describe("parseArgs", () => {
  describe("with a build, a global arg, and a preset with args", () => {
    let args: ReturnType<typeof parseArgs>
    beforeAll(() => {
      args = parseArgs(["lib", "--name", "MyLib", "dist:lib"])
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
})
