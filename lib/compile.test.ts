import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compile } from "./compile.js"
import { ConfgenError } from "./errors.js"
import { PRESET_NAMES } from "./presets/registry.js"
import { RUNTIME_NAMES } from "./runtimes.js"
import { createSystem, type System } from "./system.js"
import { expect, test } from "vitest"

const documented = [
  "runtimes=#lib,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "vitest",
]

test("collects the documented selection in registry order", async () => {
  const system = await project()
  const forward = await compile({ selection: documented, system })
  const reversed = await compile({
    selection: [
      "runtimes=#client,#server,#lib",
      "vitest",
      "vite",
      "typescript",
      "yarn",
    ],
    system,
  })

  expect(reversed).toEqual(forward)
  expect(forward.selection).toEqual({
    runtimes: ["lib", "server", "client"],
    presets: ["yarn", "typescript", "vite", "vitest"],
  })
  expect(forward.contributions).toEqual([])
})

test("collection order stays canonical for every runtime and preset", async () => {
  const system = await project()
  const canonical = [
    `runtimes=${RUNTIME_NAMES.map((name) => `#${name}`).join(",")}`,
    ...PRESET_NAMES,
  ]
  const reversed = [
    `runtimes=${[...RUNTIME_NAMES]
      .reverse()
      .map((name) => `#${name}`)
      .join(",")}`,
    ...[...PRESET_NAMES].reverse(),
  ]

  const forward = await compile({ selection: canonical, system })
  const backward = await compile({ selection: reversed, system })

  expect(backward).toEqual(forward)
  expect(forward.selection.runtimes).toEqual([...RUNTIME_NAMES])
  expect(forward.selection.presets).toEqual([...PRESET_NAMES])
  expect(forward.contributions).toEqual([])
})

test("rejects an invalid selection before reading manifests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)

  const error = await compileError(system, ["runtimes=", "vitest", "vitest"])

  expect(error.problems).toEqual([
    "Runtime group is empty.",
    'Duplicate preset "vitest".',
  ])
})

async function project(): Promise<System> {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)
  await system.writeFile("package.json", JSON.stringify({ name: "example" }))
  return system
}

async function compileError(
  system: System,
  selection: readonly string[]
): Promise<ConfgenError> {
  try {
    await compile({ selection, system })
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a compile error")
}
