import type {
  CommandGenerator,
  System,
  Presets,
  CommandWithArgs,
} from "~/commands"
import { formatTypescript } from "~/format"
import type { Runtime } from "~/runtimes"

export const generator: CommandGenerator = async ({
  runtimes,
  presets,
  system,
}) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      dev: true,
      pkg: "vitest",
    },
    {
      command: "script",
      name: "test",
      script: "vitest run --config vite.test.config.js",
    },
    {
      command: "script",
      name: "watch:test",
      script: "vitest watch --config vite.test.config.js",
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
      path: getExampleTestPath(runtimes[0], presets),
      merge: "if-not-exists",
      contents: await getExampleTest(runtimes[0], presets),
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
    `find . -not -path "./node_modules/*" | grep -E '^.+[.]test[.][tj]sx?$' | grep .`,
    undefined,
    true
  )
  return status === 0
}

const getExampleTestPath = (runtime: Runtime, presets: Presets) => {
  return presets.includes("react") && presets.includes("typescript")
    ? `${runtime}/index.test.tsx`
    : presets.includes("react")
    ? `${runtime}/index.test.jsx`
    : presets.includes("typescript")
    ? `${runtime}/index.test.ts`
    : `${runtime}/index.test.js`
}

const getExampleTest = (runtime: Runtime, presets: Presets) => {
  const componentName = runtime === "app" ? "App" : "MyComponent"

  const source = presets.includes("react")
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
  return formatTypescript(source)
}
