import React from "react"
import { App } from "./"
import { describe, it } from "vitest"
import { render } from "@testing-library/react"

describe("App", () => {
  it("should render without errors", () => {
    render(<App />)
  })
})
