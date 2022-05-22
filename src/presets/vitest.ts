import type { CommandGenerator } from "@/commands"
import type { System } from "@/system"
import type { Presets } from "@/presets"

export const generator: CommandGenerator = (presets, _, system) => [
  {
    command: "yarn",
    dev: true,
    pkg: "vitest",
  },
  {
    command: "script",
    name: "test",
    script: "vitest run",
  },
  {
    command: "script",
    name: "test:watch",
    script: "vitest watch",
  },
  ...(!hasTestFiles(system)
    ? ([
        {
          command: "file",
          path: buildExampleTestPath(presets),
          merge: "if-not-exists",
          contents: buildExampleTest(presets),
        },
      ] as const)
    : []),
  ...(presets.includes("react")
    ? ([
        {
          command: "yarn",
          pkg: "@testing-library/react",
          dev: true,
        },
        {
          command: "yarn",
          pkg: "react-dom",
          dev: true,
        },
      ] as const)
    : []),
]

const hasTestFiles = (system: System) => {
  const { status } = system.run(
    `find . -regex '^.+[.]test[.][tj]sx?$' -not -path "./node_modules/*" | grep .`
  )
  return status === 0
}

const buildExampleTestPath = (presets: Presets) => {
  return presets.includes("react") && presets.includes("typescript")
    ? "src/index.test.tsx"
    : presets.includes("react")
    ? "src/index.test.jsx"
    : presets.includes("typescript")
    ? "src/index.test.ts"
    : "src/index.test.js"
}

const buildExampleTest = (presets: Presets) => {
  return presets.includes("react")
    ? `import React from "react"
import { App } from "./"
import { describe, it } from "vitest"
import { render } from "@testing-library/react"

describe("App", () => {
  it("should render without errors", () => {
    render(<App />)
  })
})
`
    : `import { test, expect } from "vitest"

test("true is true", () => {
  expect(true).toBeTruthy()
})
`
}
