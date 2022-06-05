import { describe, it, expect } from "vitest"
import { RealSystem } from "@/system"

describe("system", () => {
  it("run method should return status codes > 0 on failure", () => {
    const system = new RealSystem()
    const unusualString = "borrow isthmus instep".replace(" ", ", ") // have to change the string otherwise this line will match!
    const failure = system.run(`grep -rnw . -e '${unusualString}'`)
    expect(failure).toHaveProperty("status", 1)
  })

  it("run method should return status code 0 on success", () => {
    const system = new RealSystem({
      silent: true,
    })
    const success = system.run(
      "grep -rnw . -e 'should return status code 0 on success'"
    )
    expect(success).toHaveProperty("status", 0)
  })
})
