import type {
  Contribution,
  ProduceContributions,
  ViteConfigItem,
} from "../contributions.js"
import { runtimePath } from "../runtimes.js"
import type { Selection } from "../selection.js"

/** Vitest owns test-runner configuration for the selected runtimes. */
export const contributions: ProduceContributions = (selection) => {
  const produced: Contribution[] = [
    dependency("vitest", "4.1.11"),
    script("test", "vitest run --config vite.test.config.ts"),
    testConfig(selection),
  ]
  if (selection.runtimes.includes("lib")) produced.push(libTest())
  return produced
}

const LIB_TEST = `import { expect, test } from "vitest"
import { greeting } from "#lib/index"

test("greets by name", () => {
  expect(greeting("baseline")).toBe("Hello, baseline")
})
`

function libTest(): Contribution {
  return {
    id: "vitest:starter:lib-test",
    source: "preset:vitest",
    kind: "starter-file",
    path: "lib/index.test.ts",
    contents: LIB_TEST,
  }
}

function testConfig(selection: Selection): Contribution {
  const patterns = selection.runtimes.map(
    (runtime) => `${runtimePath(runtime)}/**/*.test.ts`
  )
  if (selection.presets.includes("graphql")) patterns.push("gql/**/*.test.ts")
  const items: ViteConfigItem[] = [
    {
      id: "property:test-include",
      source: "preset:vitest",
      kind: "property",
      path: ["test", "include"],
      value: includeValue(patterns),
    },
  ]
  return {
    id: "vitest:config:vite.test.config.ts",
    source: "preset:vitest",
    kind: "vite-config",
    path: "vite.test.config.ts",
    items,
  }
}

function includeValue(patterns: readonly string[]): string {
  const flat = `[${patterns
    .map((pattern) => JSON.stringify(pattern))
    .join(", ")}]`
  if (`    include: ${flat},`.length <= 80) return flat
  const entries = patterns
    .map((pattern) => `      ${JSON.stringify(pattern)}`)
    .join(",\n")
  return `[\n${entries},\n    ]`
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `vitest:dependency:${name}`,
    source: "preset:vitest",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `vitest:script:${name}`,
    source: "preset:vitest",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
