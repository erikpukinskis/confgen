import { ConfgenError } from "./errors"
import { PRESET_NAMES } from "./presets/registry"
import { RUNTIME_NAMES } from "./runtimes"
import { parseSelection } from "./selection"
import { describe, expect, test } from "vitest"

const documented = [
  "runtimes=#lib:node,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "vitest",
]

test("normalizes the documented command into registry order", () => {
  expect(parseSelection(documented)).toEqual({
    runtimes: ["lib", "server", "client"],
    libraryPlatform: "node",
    presets: ["yarn", "typescript", "vite", "vitest"],
  })
})

test("canonical runtime and preset order ignores CLI order", () => {
  const reversedRuntimes = [...RUNTIME_NAMES]
    .reverse()
    .map((name) => (name === "lib" ? "#lib:universal" : `#${name}`))
    .join(",")
  const reversedPresets = [...PRESET_NAMES].reverse()

  expect(
    parseSelection([`runtimes=${reversedRuntimes}`, ...reversedPresets]),
  ).toEqual({
    runtimes: [...RUNTIME_NAMES],
    libraryPlatform: "universal",
    presets: [...PRESET_NAMES],
  })
})

test("accepts every registered runtime and preset", () => {
  for (const runtime of RUNTIME_NAMES) {
    const token = runtime === "lib" ? "#lib:node" : `#${runtime}`
    expect(parseSelection([`runtimes=${token}`]).runtimes).toEqual([runtime])
  }
  for (const preset of PRESET_NAMES) {
    expect(parseSelection(["runtimes=#lib:universal", preset]).presets).toEqual(
      [preset],
    )
  }
})

test("stores each library platform separately from the runtime", () => {
  expect(parseSelection(["runtimes=#lib:node"]).libraryPlatform).toBe("node")
  expect(parseSelection(["runtimes=#lib:browser"]).libraryPlatform).toBe(
    "browser",
  )
  expect(parseSelection(["runtimes=#lib:universal"]).libraryPlatform).toBe(
    "universal",
  )
  expect(parseSelection(["runtimes=#server"]).libraryPlatform).toBeUndefined()
})

test("reports every invalid runtime and preset together", () => {
  const error = selectionError([
    "runtimes=#lib:universal,#lib:universal,#nope,lib",
    "nope",
    "vitest",
    "vitest",
    "dist:app:lib",
    "@app",
  ])

  expect(error.problems).toEqual([
    'Duplicate runtime "lib".',
    'Unknown runtime "nope".',
    'Invalid runtime "lib". Expected #name.',
    'Unknown preset "nope".',
    'Duplicate preset "vitest".',
    'Unknown preset "dist:app:lib".',
    'Unknown preset "@app".',
  ])
})

test("reports an empty runtime group and preset problems together", () => {
  expect(selectionError(["runtimes=", "vitest", "vitest"]).problems).toEqual([
    "Runtime group is empty.",
    'Duplicate preset "vitest".',
  ])
})

test("stores an explicit node test kit separately from the platform", () => {
  expect(parseSelection(["runtimes=#lib:node:test-kit"])).toEqual({
    runtimes: ["lib"],
    libraryPlatform: "node",
    libraryTestKit: true,
    presets: [],
  })
  expect(parseSelection(["runtimes=#lib:node"]).libraryTestKit).toBeUndefined()
})

test("rejects a test kit on browser and universal libraries", () => {
  expect(
    selectionError(["runtimes=#lib:browser:test-kit,#lib:universal:test-kit"])
      .problems,
  ).toEqual([
    'Library platform "browser" cannot publish a test kit. Select #lib:node:test-kit.',
    'Library platform "universal" cannot publish a test kit. Select #lib:node:test-kit.',
  ])
})

test("a test kit modifier conflicts with the same library without it", () => {
  expect(
    selectionError(["runtimes=#lib:node,#lib:node:test-kit"]).problems,
  ).toEqual(['Conflicting modifiers for runtime "lib".'])
})

test("reports library platform problems together", () => {
  expect(
    selectionError([
      "runtimes=#lib,#lib:node,#lib:browser,#lib:deno,#lib:node:browser,#lib:node:test-kit:again,#server:node",
    ]).problems,
  ).toEqual([
    'Library runtime "#lib" requires a platform. Expected #lib:node, #lib:browser, or #lib:universal.',
    'Conflicting modifiers for runtime "lib".',
    'Unknown library platform "deno". Expected node, browser, or universal.',
    'Unknown library modifier "browser". Expected test-kit.',
    'Conflicting modifiers on "#lib:node:test-kit:again".',
    'Runtime "server" does not accept a platform modifier.',
  ])
})

test("reports a missing runtime group", () => {
  expect(selectionError([]).problems).toEqual([
    "Missing runtime group. Expected runtimes=#name[,#name...].",
  ])
  expect(selectionError(["yarn", "typescript"]).problems).toEqual([
    "Missing runtime group. Expected runtimes=#name[,#name...].",
  ])
})

describe("selection errors", () => {
  test("are Confgen errors", () => {
    expect(selectionError(["runtimes=#missing"])).toBeInstanceOf(ConfgenError)
  })
})

function selectionError(args: readonly string[]): ConfgenError {
  try {
    parseSelection(args)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a selection error")
}
