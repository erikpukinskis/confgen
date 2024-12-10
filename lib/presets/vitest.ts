import { getGithubWorkflow } from "./githubActions"
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

  if (presets.includes("githubActions")) {
    commands.push({
      command: "file",
      path: ".github/workflows/unit-tests.yml",
      contents: getUnitTestsWorkflow(presets),
      merge: "replace",
    })
  }

  if (presets.includes("codespaces")) {
    commands.push(
      {
        command: "file",
        path: ".vscode/launch.json",
        contents: {
          version: "0.2.0",
        },
      },
      {
        command: "file",
        path: ".vscode/launch.json",
        accessor: "configurations[name=Debug Current Test File]",
        merge: "replace",
        contents: {
          type: "node",
          request: "launch",
          name: "Debug Current Test File",
          skipFiles: ["<node_internals>/**", "**/node_modules/**"],
          program: "${workspaceRoot}/node_modules/vitest/vitest.mjs",
          args: [
            "related",
            "--config",
            "vite.test.config.js",
            "${relativeFile}",
          ],
          smartStep: true,
          console: "integratedTerminal",
        },
      }
    )
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

const getUnitTestsWorkflow = (presets: Presets) => {
  const steps = [
    {
      run: "yarn test",
    },
  ]

  if (presets.includes("dist")) {
    steps.unshift({
      run: "yarn build",
    })
  }

  return getGithubWorkflow({
    needsPackages: true,
    workflowName: "unit tests",
    jobs: [
      {
        jobName: "run",
        steps,
      },
    ],
  })
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
  const source = presets.includes("react")
    ? `import { render } from "@testing-library/react"
import React from "react"
import { describe, it } from "vitest"

const MyComponent = () => <>hello world!</>

describe("MyComponent", () => {
  it("should render without errors", () => {
    render(<MyComponent />)
  })
})
`
    : `import { it, expect } from "vitest"

const myFunction = () => "hello world!"

it("returns a greeting", () => {
  expect(myFunction()).toContain("hello")
})
`
  return formatTypescript(source)
}
