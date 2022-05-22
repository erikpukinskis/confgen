import type { CommandGenerator } from "@/commands"
import type { System } from "@/system"

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
          path: "src/index.test.tsx",
          merge: "if-not-exists",
          contents: buildExampleTest(),
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

const buildExampleTest = () => {
  return `import React from "react"
import { App } from "./"
import { describe, it } from "vitest"
import { render } from "@testing-library/react"

describe("App", () => {
  it("should render without errors", () => {
    render(<App />)
  })
})
`
}
