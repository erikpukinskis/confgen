import { createHash } from "node:crypto"
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compile, compileCollected } from "./compile.js"
import type { Contribution } from "./contributions.js"
import { ConfgenError } from "./errors.js"
import { readProjectFacts } from "./facts.js"
import { LOCK_PATH, serializeLock, textHash } from "./lock.js"
import { PRESET_NAMES } from "./presets/registry.js"
import { RUNTIME_NAMES } from "./runtimes.js"
import { createSystem, type RunResult, type System } from "./system.js"
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

test("rejects an unsupported lock before writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)
  await system.writeFile("package.json", JSON.stringify({ name: "example" }))
  await system.writeFile("confgen.lock", '{"lockVersion":9}\n')
  await system.writeFile("keep.txt", "same\n")

  const error = await compileError(system, ["runtimes=#lib"])

  expect(error.problems[0]).toContain("lock version 9 is not supported")
  expect(await system.readFile("confgen.lock")).toBe('{"lockVersion":9}\n')
  expect(await system.readFile("keep.txt")).toBe("same\n")
  expect(await system.readFile("package.json")).toBe(
    JSON.stringify({ name: "example" })
  )
})

test("refuses to remove a changed whole file before writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)
  const original = "FROM node:24\n"
  await system.writeFile("package.json", JSON.stringify({ name: "example" }))
  await system.writeFile("Dockerfile", "FROM node:24\nRUN echo edited\n")
  await system.writeFile(
    "confgen.lock",
    `${JSON.stringify(
      {
        lockVersion: 1,
        confgenVersion: "0.95.0",
        runtimes: ["lib"],
        presets: [],
        contributions: [
          {
            id: "docker",
            source: "preset:docker",
            path: "Dockerfile",
            strategy: "whole-file",
            hash: textHash(original),
          },
        ],
      },
      null,
      2
    )}\n`
  )
  const lockBefore = await system.readFile("confgen.lock")

  const error = await compileError(system, ["runtimes=#lib"])

  expect(error.problems).toEqual([
    'Cannot remove changed whole file "Dockerfile" because its contents no longer match confgen.lock.',
  ])
  expect(await system.readFile("confgen.lock")).toBe(lockBefore)
  expect(await system.readFile("Dockerfile")).toBe(
    "FROM node:24\nRUN echo edited\n"
  )
})

test("removes an unchanged deselected whole file and then leaves a clean rerun", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)
  const original = "FROM node:24\n"
  await system.writeFile("package.json", JSON.stringify({ name: "example" }))
  await system.writeFile("Dockerfile", original)
  await system.writeFile(
    "confgen.lock",
    `${JSON.stringify(
      {
        lockVersion: 1,
        confgenVersion: "0.95.0",
        runtimes: ["lib"],
        presets: [],
        contributions: [
          {
            id: "docker",
            source: "preset:docker",
            path: "Dockerfile",
            strategy: "whole-file",
            hash: createHash("sha256").update(original).digest("hex"),
          },
        ],
      },
      null,
      2
    )}\n`
  )

  await compile({ selection: ["runtimes=#lib"], system })
  await expect(system.readFile("Dockerfile")).rejects.toThrow()

  const lock = await system.readFile(LOCK_PATH)
  const lockStat = await stat(join(cwd, LOCK_PATH))
  await compile({ selection: ["runtimes=#lib"], system })
  expect(await system.readFile(LOCK_PATH)).toBe(lock)
  expect((await stat(join(cwd, LOCK_PATH))).mtimeMs).toBe(lockStat.mtimeMs)
})

test("a yarn failure leaves the previous lock untouched", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const real = createSystem(cwd)
  await real.writeFile("package.json", JSON.stringify({ name: "example" }))
  const previous = `${JSON.stringify(
    {
      lockVersion: 1,
      confgenVersion: "0.95.0",
      runtimes: ["lib"],
      presets: ["typescript"],
      contributions: [],
    },
    null,
    2
  )}\n`
  await real.writeFile(LOCK_PATH, previous)
  const system = failingInstall(real)
  const facts = await readProjectFacts(real)
  const dependency: Contribution = {
    id: "typescript",
    source: "preset:typescript",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: "typescript",
    range: "^5",
  }

  const error = await collectedError(system, facts, [dependency])

  expect(error.problems[0]).toContain("yarn install failed")
  expect(await real.readFile(LOCK_PATH)).toBe(previous)
  expect(await real.readFile("package.json")).toContain('"typescript"')
})

test("lock text does not depend on CLI order", async () => {
  const forwardDir = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const reverseDir = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const forward = createSystem(forwardDir)
  const reverse = createSystem(reverseDir)
  await forward.writeFile("package.json", JSON.stringify({ name: "example" }))
  await reverse.writeFile("package.json", JSON.stringify({ name: "example" }))

  await compile({
    selection: ["runtimes=#lib,#server", "typescript", "vite"],
    system: forward,
  })
  await compile({
    selection: ["runtimes=#server,#lib", "vite", "typescript"],
    system: reverse,
  })

  expect(await reverse.readFile(LOCK_PATH)).toBe(
    await forward.readFile(LOCK_PATH)
  )
  expect(await forward.readFile(LOCK_PATH)).toBe(
    serializeLock({
      lockVersion: 1,
      confgenVersion: "0.95.0",
      runtimes: ["lib", "server"],
      presets: ["typescript", "vite"],
      contributions: [],
    })
  )
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

async function collectedError(
  system: System,
  facts: Awaited<ReturnType<typeof readProjectFacts>>,
  contributions: readonly Contribution[]
): Promise<ConfgenError> {
  try {
    await compileCollected({
      selection: { runtimes: ["lib"], presets: ["typescript"] },
      facts,
      contributions,
      system,
    })
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a compile error")
}

function failingInstall(real: System): System {
  return {
    readFile: (path) => real.readFile(path),
    writeFile: (path, contents) => real.writeFile(path, contents),
    removeFile: (path) => real.removeFile(path),
    rename: (from, to) => real.rename(from, to),
    run: (): Promise<RunResult> =>
      Promise.resolve({ status: 1, stdout: "", stderr: "install failed" }),
  }
}
