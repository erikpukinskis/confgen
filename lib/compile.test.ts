import { createHash } from "node:crypto"
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compile, compileCollected } from "./compile"
import { collectContributions, type Contribution } from "./contributions"
import { ConfgenError } from "./errors"
import { readProjectFacts } from "./facts"
import {
  LOCK_PATH,
  lockFromContributions,
  parseLock,
  serializeLock,
  textHash,
} from "./lock"
import { PRESET_NAMES } from "./presets/registry"
import { RUNTIME_NAMES } from "./runtimes"
import { parseSelection } from "./selection"
import { CommandError, createSystem, type System } from "./system"
import { expect, test } from "vitest"

const documented = [
  "runtimes=#lib:node,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "vitest",
]

test("collects the documented selection in registry order", async () => {
  const facts = await readProjectFacts(await project())
  const forward = collectContributions(parseSelection(documented), facts)
  const reversed = collectContributions(
    parseSelection([
      "runtimes=#client,#server,#lib:node",
      "vitest",
      "vite",
      "typescript",
      "yarn",
    ]),
    facts,
  )

  expect(reversed).toEqual(forward)
  expect(parseSelection(documented)).toEqual({
    runtimes: ["lib", "server", "client"],
    libraryPlatform: "node",
    presets: ["yarn", "typescript", "vite", "vitest"],
  })
  expect(forward.length).toBeGreaterThan(0)
})

test("collection order stays canonical for every runtime and preset", async () => {
  const system = await project()
  const canonical = [
    `runtimes=${RUNTIME_NAMES.map((name) =>
      name === "lib" ? "#lib:node" : `#${name}`,
    ).join(",")}`,
    ...PRESET_NAMES,
  ]
  const reversed = [
    `runtimes=${[...RUNTIME_NAMES]
      .reverse()
      .map((name) => (name === "lib" ? "#lib:node" : `#${name}`))
      .join(",")}`,
    ...[...PRESET_NAMES].reverse(),
  ]

  const facts = await readProjectFacts(system)
  const forward = collectContributions(parseSelection(canonical), facts)
  const backward = collectContributions(parseSelection(reversed), facts)

  expect(backward).toEqual(forward)
  expect(parseSelection(canonical).runtimes).toEqual([...RUNTIME_NAMES])
  expect(parseSelection(canonical).presets).toEqual([...PRESET_NAMES])
  expect(forward.length).toBeGreaterThan(0)
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

  const error = await compileError(system, ["runtimes=#lib:universal"])

  expect(error.problems[0]).toContain("lock version 9 is not supported")
  expect(await system.readFile("confgen.lock")).toBe('{"lockVersion":9}\n')
  expect(await system.readFile("keep.txt")).toBe("same\n")
  expect(await system.readFile("package.json")).toBe(
    JSON.stringify({ name: "example" }),
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
        libraryPlatform: "universal",
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
      2,
    )}\n`,
  )
  const lockBefore = await system.readFile("confgen.lock")

  const error = await compileError(system, ["runtimes=#lib:universal"])

  expect(error.problems).toEqual([
    'Cannot remove changed whole file "Dockerfile" because its contents no longer match confgen.lock.',
  ])
  expect(await system.readFile("confgen.lock")).toBe(lockBefore)
  expect(await system.readFile("Dockerfile")).toBe(
    "FROM node:24\nRUN echo edited\n",
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
        libraryPlatform: "universal",
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
      2,
    )}\n`,
  )

  await compile({ selection: ["runtimes=#lib:universal"], system })
  await expect(system.readFile("Dockerfile")).rejects.toThrow()

  const lock = await system.readFile(LOCK_PATH)
  const lockStat = await stat(join(cwd, LOCK_PATH))
  await compile({ selection: ["runtimes=#lib:universal"], system })
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
      libraryPlatform: "universal",
      presets: ["typescript"],
      contributions: [],
    },
    null,
    2,
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

  let error: unknown
  try {
    await compileCollected({
      selection: {
        runtimes: ["lib"],
        libraryPlatform: "universal",
        presets: ["typescript"],
      },
      facts,
      contributions: [dependency],
      system,
    })
  } catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(CommandError)
  expect(await real.readFile(LOCK_PATH)).toBe(previous)
  expect(await real.readFile("package.json")).toContain('"typescript"')
})

test("reconciles a lib lock that omits libraryPlatform", async () => {
  const system = await project()
  await system.writeFile(
    "confgen.lock",
    `${JSON.stringify(
      {
        lockVersion: 1,
        confgenVersion: "0.95.0",
        runtimes: ["lib"],
        presets: ["git"],
        contributions: [
          {
            id: "git:ignore:04",
            source: "preset:git",
            path: ".gitignore",
            strategy: "line",
            value: "dist",
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  await system.writeFile(".gitignore", "dist\n")

  await compile({ selection: ["runtimes=#lib:node", "git"], system })

  const lock = parseLock(await system.readFile(LOCK_PATH))
  expect(lock.libraryPlatform).toBe("node")
  expect(lock.libraryTestKit).toBeUndefined()
  expect(lock.runtimes).toEqual(["lib"])
  expect(lock.presets).toEqual(["git"])
  expect(lock.contributions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "git:ignore:04",
        strategy: "line",
        value: "dist",
      }),
    ]),
  )
  expect(await system.readFile(".gitignore")).toContain("dist")
})

test("lock text does not depend on CLI order", async () => {
  const facts = await readProjectFacts(await project())
  const forwardSelection = parseSelection([
    "runtimes=#lib:universal,#server",
    "typescript",
    "vite",
  ])
  const reverseSelection = parseSelection([
    "runtimes=#server,#lib:universal",
    "vite",
    "typescript",
  ])

  expect(
    serializeLock(
      lockFromContributions({
        selection: reverseSelection,
        contributions: collectContributions(reverseSelection, facts),
      }),
    ),
  ).toBe(
    serializeLock(
      lockFromContributions({
        selection: forwardSelection,
        contributions: collectContributions(forwardSelection, facts),
      }),
    ),
  )
})

async function project(): Promise<System> {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-compile-"))
  const system = createSystem(cwd)
  await system.writeFile(
    "package.json",
    JSON.stringify({
      name: "example",
      repository: "https://github.com/example/example.git",
    }),
  )
  return system
}

async function compileError(
  system: System,
  selection: readonly string[],
): Promise<ConfgenError> {
  try {
    await compile({ selection, system })
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a compile error")
}

function failingInstall(real: System): System {
  return {
    readFile: (path) => real.readFile(path),
    listFiles: (path) => real.listFiles(path),
    writeFile: (path, contents) => real.writeFile(path, contents),
    removeFile: (path) => real.removeFile(path),
    rename: (from, to) => real.rename(from, to),
    run: (_executable, _args, options) =>
      real.run(
        process.execPath,
        ["-e", "console.error('install failed'); process.exit(1)"],
        options,
      ),
  }
}
