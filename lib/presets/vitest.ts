import type {
  CommandGenerator,
  System,
  Presets,
  CommandWithArgs,
} from "@/commands"
import type { Build } from "@/builds"

export const generator: CommandGenerator = ({ builds, presets, system }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      dev: true,
      pkg: "vitest",
    },
    {
      command: "script",
      name: "test",
      script: "vitest run --config vite.lib.config.js",
    },
    {
      command: "script",
      name: "test:watch",
      script: "vitest watch --config vite.lib.config.js",
    },
  ]

  if (presets.includes("codespaces")) {
    commands.push({
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
    })
  }

  if (!hasTestFiles(system)) {
    commands.push({
      command: "file",
      path: buildExampleTestPath(builds[0], presets),
      merge: "if-not-exists",
      contents: buildExampleTest(builds[0], presets),
    })
  }

  if (presets.includes("react")) {
    commands.push(
      {
        command: "yarn",
        pkg: "@testing-library/react",
        dev: true,
      },
      {
        command: "yarn",
        pkg: "react-dom",
      }
    )
  }

  return commands
}

const hasTestFiles = (system: System) => {
  const { status } = system.run(
    `find . -not -path "./node_modules/*" | grep -E '^.+[.]test[.][tj]sx?$' | grep .`
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
