import { ConfgenError } from "./errors.js"
import { PRESET_NAMES } from "./presets/registry.js"
import { RUNTIME_NAMES } from "./runtimes.js"
import { parseSelection } from "./selection.js"
import { describe, expect, test } from "vitest"

const documented = [
  "runtimes=#lib,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "vitest",
]

test("normalizes the documented command into registry order", () => {
  expect(parseSelection(documented)).toEqual({
    runtimes: ["lib", "server", "client"],
    presets: ["yarn", "typescript", "vite", "vitest"],
  })
})

test("canonical runtime and preset order ignores CLI order", () => {
  const reversedRuntimes = [...RUNTIME_NAMES]
    .reverse()
    .map((name) => `#${name}`)
    .join(",")
  const reversedPresets = [...PRESET_NAMES].reverse()

  expect(
    parseSelection([`runtimes=${reversedRuntimes}`, ...reversedPresets])
  ).toEqual({
    runtimes: [...RUNTIME_NAMES],
    presets: [...PRESET_NAMES],
  })
})

test("accepts every registered runtime and preset", () => {
  for (const runtime of RUNTIME_NAMES) {
    expect(parseSelection([`runtimes=#${runtime}`]).runtimes).toEqual([runtime])
  }
  for (const preset of PRESET_NAMES) {
    expect(parseSelection(["runtimes=#lib", preset]).presets).toEqual([preset])
  }
})

test("reports every invalid runtime and preset together", () => {
  const error = selectionError([
    "runtimes=#lib,#lib,#nope,lib",
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
