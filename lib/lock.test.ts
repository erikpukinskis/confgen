import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Contribution } from "./contributions.js"
import { ConfgenError } from "./errors.js"
import {
  LOCK_PATH,
  LOCK_TEMPORARY_PATH,
  lockFromContributions,
  parseLock,
  readLock,
  serializeLock,
  textHash,
  writeLockFile,
} from "./lock.js"
import type { Selection } from "./selection.js"
import { createSystem } from "./system.js"
import { expect, test } from "vitest"

const selection: Selection = {
  runtimes: ["server", "lib"],
  presets: ["vite", "typescript"],
}

test("serializes lock evidence deterministically", () => {
  const forward = lockFromContributions({
    selection: { runtimes: ["lib", "server"], presets: ["typescript", "vite"] },
    contributions: [
      starter(),
      wholeFile(),
      structured(),
      line(),
      dependency(),
      script(),
      vite(),
    ],
  })
  const reversed = lockFromContributions({
    selection: { runtimes: ["lib", "server"], presets: ["typescript", "vite"] },
    contributions: [
      vite(),
      script(),
      dependency(),
      line(),
      structured(),
      wholeFile(),
      starter(),
    ],
  })

  expect(serializeLock(reversed)).toBe(serializeLock(forward))
  const parsed = parseLock(serializeLock(forward))
  expect(parsed.lockVersion).toBe(1)
  expect(parsed.runtimes).toEqual(["lib", "server"])
  expect(parsed.contributions.map((entry) => entry.id)).toEqual([
    "dep",
    "line",
    "script",
    "starter",
    "structured",
    "vite",
    "whole",
  ])
  const whole = parsed.contributions.find((entry) => entry.id === "whole")
  expect(whole).toMatchObject({
    strategy: "whole-file",
    hash: textHash("generated\n"),
  })
  const starterEntry = parsed.contributions.find(
    (entry) => entry.id === "starter"
  )
  expect(starterEntry).toEqual({
    id: "starter",
    source: "runtime:server",
    path: "server/index.ts",
    strategy: "starter-file",
  })
  expect(JSON.stringify(starterEntry)).not.toContain("hash")
})

test("rejects an unsupported lock version", () => {
  expect(() => parseLock('{"lockVersion":2,"confgenVersion":"0.0.0"}')).toThrow(
    /lock version 2 is not supported/
  )
})

test("rejects a lock that is not the supported shape", () => {
  const error = parseError('{"lockVersion":1}')
  expect(error.problems[0]).toContain("confgen.lock")
})

test("a missing lock is an adoption run", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-lock-"))
  const system = createSystem(cwd)
  expect(await readLock(system)).toBeUndefined()
})

test("replaces the lock through a same-directory temporary file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-lock-"))
  const system = createSystem(cwd)
  const lock = lockFromContributions({
    selection: { runtimes: ["lib"], presets: [] },
    contributions: [],
  })

  await writeLockFile(system, lock)

  expect(await system.readFile(LOCK_PATH)).toBe(serializeLock(lock))
  await expect(system.readFile(LOCK_TEMPORARY_PATH)).rejects.toThrow()
})

test("selection order in the caller is preserved as given", () => {
  const lock = lockFromContributions({
    selection,
    contributions: [],
  })
  expect(lock.runtimes).toEqual(["server", "lib"])
})

function parseError(text: string): ConfgenError {
  try {
    parseLock(text)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a lock error")
}

function wholeFile(): Contribution {
  return {
    id: "whole",
    source: "preset:docker",
    kind: "whole-file",
    path: "Dockerfile",
    contents: "generated\n",
  }
}

function starter(): Contribution {
  return {
    id: "starter",
    source: "runtime:server",
    kind: "starter-file",
    path: "server/index.ts",
    contents: "export {}\n",
  }
}

function structured(): Contribution {
  return {
    id: "structured",
    source: "preset:typescript",
    kind: "structured",
    path: "tsconfig.json",
    format: "json",
    address: ["compilerOptions", "strict"],
    value: true,
    update: "replace",
  }
}

function line(): Contribution {
  return {
    id: "line",
    source: "preset:git",
    kind: "line",
    path: ".gitignore",
    value: "dist",
  }
}

function dependency(): Contribution {
  return {
    id: "dep",
    source: "preset:typescript",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: "typescript",
    range: "^5",
  }
}

function script(): Contribution {
  return {
    id: "script",
    source: "preset:typescript",
    kind: "package-script",
    manifest: "package.json",
    name: "check:types",
    command: "tsc --noEmit",
  }
}

function vite(): Contribution {
  return {
    id: "vite",
    source: "preset:vite",
    kind: "vite-config",
    path: "vite.config.ts",
    items: [
      {
        id: "property:port",
        source: "preset:vite",
        kind: "property",
        path: ["server", "port"],
        value: "3000",
      },
      {
        id: "import:react",
        source: "preset:react",
        kind: "import",
        module: "@vitejs/plugin-react",
        imported: { kind: "default" },
        preferredLocal: "react",
      },
    ],
  }
}
