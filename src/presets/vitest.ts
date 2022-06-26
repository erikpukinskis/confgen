import type { CommandGenerator, System, Presets } from "@/commands"
import type { Build } from "@/builds"

export const generator: CommandGenerator = ({ builds, presets, system }) => [
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
  ...(presets.includes("codespaces")
    ? ([
        {
          command: "file",
          path: ".vscode/launch.json",
          contents: {
            version: "0.2.0",
            configurations: [
              {
                type: "pwa-node",
                request: "launch",
                name: "Debug Current Test File",
                skipFiles: ["<node_internals>/**", "**/node_modules/**"],
                program: "${workspaceRoot}/node_modules/vitest/vitest.mjs",
                args: ["run", "${relativeFile}"],
                smartStep: true,
                console: "integratedTerminal",
              },
            ],
          },
        },
      ] as const)
    : []),
  ...(!hasTestFiles(system)
    ? ([
        {
          command: "file",
          path: buildExampleTestPath(builds[0], presets),
          merge: "if-not-exists",
          contents: buildExampleTest(builds[0], presets),
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

const buildExampleTestPath = (build: Build, presets: Presets) => {
  return presets.includes("react") && presets.includes("typescript")
    ? `${build}/index.test.tsx`
    : presets.includes("react")
    ? `${build}/index.test.jsx`
    : presets.includes("typescript")
    ? `${build}/index.test.ts`
    : `${build}/index.test.js`
}

const buildExampleTest = (build: Build, presets: Presets) => {
  const componentName = build === "app" ? "App" : "MyComponent"

  return presets.includes("react")
    ? `import React from "react"
import { ${componentName} } from "./"
import { describe, it } from "vitest"
import { render } from "@testing-library/react"

describe("${componentName}", () => {
  it("should render without errors", () => {
    render(<${componentName} />)
  })
})
`
    : `import { test, expect } from "vitest"

test("true is true", () => {
  expect(true).toBeTruthy()
})
`
}
