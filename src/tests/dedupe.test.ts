import { describe, it, expect } from "vitest"
import { dedupeArray } from "@/dedupe"

describe("dedupe", () => {
  it("should dedupe identical objects", () => {
    expect(
      dedupeArray([{ "prefer": "type-imports" }, { "prefer": "type-imports" }])
    ).to.eql([{ "prefer": "type-imports" }])
  })
})
