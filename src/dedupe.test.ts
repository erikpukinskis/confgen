import { describe, it, expect } from "vitest"
import { dedupeArray } from "@/dedupe"

describe("dedupe", () => {
  it("detects identical objects", () => {
    expect(
      dedupeArray([{ prefer: "type-imports" }, { prefer: "type-imports" }])
    ).to.eql([{ prefer: "type-imports" }])
  })

  it("detecs content tags", () => {
    expect(
      dedupeArray([
        { add: { content: `import { Scalars } from "scalars" //@same` } },
        { add: { content: `import * from "scalars" //@same` } },
        {
          add: { content: `import { Context } from "context" //@different` },
        },
      ])
    ).to.eql([
      { add: { content: `import * from "scalars" //@same` } },
      { add: { content: `import { Context } from "context" //@different` } },
    ])
  })
})
