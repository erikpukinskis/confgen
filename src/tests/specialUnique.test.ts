import { describe, it, expect } from "vitest"
import { specialUnique } from "@/specialUnique"

describe("specialUnique", () => {
  it("should dedupe identical objects", () => {
    expect(
      specialUnique([
        { "prefer": "type-imports" },
        { "prefer": "type-imports" },
      ])
    ).to.eql([{ "prefer": "type-imports" }])
  })
})
