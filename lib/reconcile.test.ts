import type { Contribution } from "./contributions.js"
import { ConfgenError } from "./errors.js"
import { textHash, type LockData } from "./lock.js"
import { reconcile } from "./reconcile.js"
import type { Selection } from "./selection.js"
import { expect, test } from "vitest"

const selection: Selection = {
  runtimes: ["lib"],
  presets: ["typescript", "git"],
}

test("creates absent files and leaves an unchanged rerun alone", () => {
  const created = reconcile({
    selection,
    contributions: [
      whole("Dockerfile", "FROM node:24\n"),
      starter("lib/index.ts", "export {}\n"),
      structured(["compilerOptions", "strict"], true, "replace"),
      line(".gitignore", "dist"),
      dependency("typescript", "^5"),
      script("check:types", "tsc --noEmit"),
    ],
    prior: undefined,
    files: new Map([["package.json", '{ "name": "example" }\n']]),
    yarnLockPresent: false,
    pnpPresent: false,
  })

  expect(changeMap(created.files)).toMatchObject({
    "Dockerfile": "FROM node:24\n",
    "lib/index.ts": "export {}\n",
    ".gitignore": "dist\n",
  })
  expect(
    created.files.find((change) => change.path === "tsconfig.json")?.type
  ).toBe("write")
  expect(created.runYarnInstall).toBe(true)

  const files = new Map<string, string>([
    ["package.json", packageText(created.files)],
  ])
  for (const change of created.files) {
    if (change.type === "write") files.set(change.path, change.contents)
  }
  const again = reconcile({
    selection,
    contributions: created.desiredContributions,
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(again.files).toEqual([])
  expect(again.runYarnInstall).toBe(false)
})

test("preserves application JSON and replaces a recognized value", () => {
  const current = `{
  "name": "example",
  "compilerOptions": {
    "strict": false,
    "custom": true
  }
}
`
  const merged = reconcile({
    selection,
    contributions: [
      structured(
        ["compilerOptions"],
        { strict: true },
        "merge",
        "tsconfig.json"
      ),
    ],
    prior: undefined,
    files: new Map([["tsconfig.json", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const written = writtenContents(merged.files, "tsconfig.json")
  expect(JSON.parse(written)).toEqual({
    name: "example",
    compilerOptions: { strict: true, custom: true },
  })

  const replaced = reconcile({
    selection,
    contributions: [structured(["compilerOptions", "strict"], true, "replace")],
    prior: undefined,
    files: new Map([["tsconfig.json", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(JSON.parse(writtenContents(replaced.files, "tsconfig.json"))).toEqual({
    name: "example",
    compilerOptions: { strict: true, custom: true },
  })
})

test("preserves unrelated YAML keys and comments", () => {
  const current = `# keep
name: example
compilerOptions:
  custom: true
`
  const result = reconcile({
    selection,
    contributions: [
      {
        id: "yaml-strict",
        source: "preset:typescript",
        kind: "structured",
        path: "config.yml",
        format: "yaml",
        address: ["compilerOptions", "strict"],
        value: true,
        update: "replace",
      },
    ],
    prior: undefined,
    files: new Map([["config.yml", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const contents = writtenContents(result.files, "config.yml")
  expect(contents).toContain("# keep")
  expect(contents).toContain("custom: true")
  expect(contents).toContain("strict: true")
})

test("stops before a change set when replacement would destroy a container", () => {
  const error = reconcileError({
    selection,
    contributions: [structured(["compilerOptions", "strict"], true, "replace")],
    prior: undefined,
    files: new Map([["tsconfig.json", '{ "compilerOptions": "custom" }\n']]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(error.problems[0]).toContain("is not an object")
})

test("upgrades a recognized line and dependency, and can remove them", () => {
  const prior = lockOf([
    line(".gitignore", "dist"),
    dependency("typescript", "^5"),
  ])
  const upgraded = reconcile({
    selection,
    contributions: [
      line(".gitignore", "dist/"),
      dependency("typescript", "^6"),
    ],
    prior,
    files: new Map([
      [".gitignore", "node_modules\ndist\n"],
      [
        "package.json",
        '{ "name": "example", "devDependencies": { "typescript": "^5" } }\n',
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(writtenContents(upgraded.files, ".gitignore")).toBe(
    "node_modules\ndist/\n"
  )
  expect(
    parsedObject(writtenContents(upgraded.files, "package.json"))
      .devDependencies
  ).toEqual({
    typescript: "^6",
  })

  const removed = reconcile({
    selection,
    contributions: [],
    prior: upgraded.lock,
    files: new Map([
      [".gitignore", "node_modules\ndist/\n"],
      ["package.json", writtenContents(upgraded.files, "package.json")],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(writtenContents(removed.files, ".gitignore")).toBe("node_modules\n")
  expect(
    parsedObject(writtenContents(removed.files, "package.json")).devDependencies
  ).toBeUndefined()
})

test("refuses to delete a changed whole file and never deletes a starter", () => {
  const prior = lockOf([
    whole("Dockerfile", "FROM node:24\n"),
    starter("lib/index.ts", "export {}\n"),
  ])
  const error = reconcileError({
    selection,
    contributions: [],
    prior,
    files: new Map([
      ["Dockerfile", "FROM node:24\nRUN echo edited\n"],
      ["lib/index.ts", "export const edited = true\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(error.problems).toEqual([
    'Cannot remove changed whole file "Dockerfile" because its contents no longer match confgen.lock.',
  ])

  const unchanged = reconcile({
    selection,
    contributions: [],
    prior,
    files: new Map([
      ["Dockerfile", "FROM node:24\n"],
      ["lib/index.ts", "export const edited = true\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(unchanged.files).toEqual([{ type: "remove", path: "Dockerfile" }])
  expect(unchanged.lock.contributions).toEqual([])
})

test("does not recreate a delivered starter after it is deleted", () => {
  const delivered = lockOf([starter("lib/index.ts", "export {}\n")])
  const result = reconcile({
    selection,
    contributions: [starter("lib/index.ts", "export {}\n")],
    prior: delivered,
    files: new Map(),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(result.files).toEqual([])
  expect(
    result.lock.contributions.find((entry) => entry.strategy === "starter-file")
  ).toMatchObject({ path: "lib/index.ts" })
})

test("adopts an existing project without a lock and does not invent removals", () => {
  const result = reconcile({
    selection,
    contributions: [
      starter("lib/index.ts", "export {}\n"),
      line(".gitignore", "dist"),
    ],
    prior: undefined,
    files: new Map([
      ["lib/index.ts", "export const kept = true\n"],
      [".gitignore", "notes\n"],
      ["README.md", "leave me\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })

  expect(result.files.map((change) => change.path)).toEqual([".gitignore"])
  expect(writtenContents(result.files, ".gitignore")).toBe("notes\ndist\n")
  expect(
    result.lock.contributions.find((entry) => entry.strategy === "starter-file")
  ).toMatchObject({
    path: "lib/index.ts",
  })
})

test("records whole-file hashes and does not require yarn for scripts alone", () => {
  const result = reconcile({
    selection,
    contributions: [
      whole("Dockerfile", "FROM node:24\n"),
      script("build", "tsc"),
    ],
    prior: undefined,
    files: new Map([["package.json", '{ "name": "example" }\n']]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const recorded = result.lock.contributions.find(
    (entry) => entry.id === "Dockerfile"
  )
  expect(recorded).toMatchObject({
    strategy: "whole-file",
    hash: textHash("FROM node:24\n"),
  })
  expect(result.runYarnInstall).toBe(false)
})

test("runs yarn when dependency declarations change or yarn artifacts are missing", () => {
  const manifest =
    '{ "name": "example", "devDependencies": { "typescript": "^5" } }\n'
  const missingArtifacts = reconcile({
    selection,
    contributions: [],
    prior: undefined,
    files: new Map([["package.json", manifest]]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  expect(missingArtifacts.runYarnInstall).toBe(true)

  const present = reconcile({
    selection,
    contributions: [],
    prior: undefined,
    files: new Map([["package.json", manifest]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(present.runYarnInstall).toBe(false)

  const config = reconcile({
    selection,
    contributions: [
      {
        id: "yarnrc",
        source: "preset:yarn",
        kind: "whole-file",
        path: ".yarnrc.yml",
        contents: "nodeLinker: pnp\n",
      },
    ],
    prior: undefined,
    files: new Map([["package.json", '{ "name": "example" }\n']]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(config.runYarnInstall).toBe(true)
})

function parsedObject(text: string): Record<string, unknown> {
  const value = parsedJson(text)
  if (!isRecord(value)) throw new Error("Expected a JSON object")
  return value
}

function parsedJson(text: string): unknown {
  return JSON.parse(text)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function reconcileError(input: Parameters<typeof reconcile>[0]): ConfgenError {
  try {
    reconcile(input)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a reconcile error")
}

function changeMap(
  files: readonly { type: string; path: string; contents?: string }[]
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const change of files) {
    if (change.type === "write" && change.contents !== undefined) {
      result[change.path] = change.contents
    }
  }
  return result
}

function packageText(
  files: readonly { type: string; path: string; contents?: string }[]
): string {
  const change = files.find(
    (entry) => entry.path === "package.json" && entry.type === "write"
  )
  if (change === undefined || change.contents === undefined) {
    throw new Error("package.json was not written")
  }
  return change.contents
}

function writtenContents(
  files: readonly { type: string; path: string; contents?: string }[],
  path: string
): string {
  const change = files.find(
    (entry) => entry.path === path && entry.type === "write"
  )
  if (change === undefined || change.contents === undefined) {
    throw new Error(`${path} was not written`)
  }
  return change.contents
}

function lockOf(contributions: readonly Contribution[]): LockData {
  return reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map(),
    yarnLockPresent: true,
    pnpPresent: true,
  }).lock
}

function whole(path: string, contents: string): Contribution {
  return {
    id: path,
    source: "preset:docker",
    kind: "whole-file",
    path,
    contents,
  }
}

function starter(path: string, contents: string): Contribution {
  return {
    id: path,
    source: "runtime:lib",
    kind: "starter-file",
    path,
    contents,
  }
}

function structured(
  address: readonly (string | number)[],
  value: boolean | { readonly strict: boolean },
  update: "merge" | "replace",
  path = "tsconfig.json"
): Contribution {
  return {
    id: address.join("."),
    source: "preset:typescript",
    kind: "structured",
    path,
    format: "json",
    address,
    value,
    update,
  }
}

function line(path: string, value: string): Contribution {
  return { id: path, source: "preset:git", kind: "line", path, value }
}

function dependency(packageName: string, range: string): Contribution {
  return {
    id: packageName,
    source: "preset:typescript",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: packageName,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: name,
    source: "preset:typescript",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
