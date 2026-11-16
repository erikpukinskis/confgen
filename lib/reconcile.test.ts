import type { Contribution, JsonValue } from "./contributions"
import { ConfgenError } from "./errors"
import { textHash, type LockData } from "./lock"
import { reconcile } from "./reconcile"
import type { Selection } from "./selection"
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

test("reconciles Dockerfile upgrades around application edits and same-position additions", () => {
  const base = "FROM node:24\nRUN echo standard\nRUN echo stable\nCMD start\n"
  const current =
    "FROM node:24\nRUN echo application\nRUN echo stable\nRUN echo custom\nCMD start\n"
  const next = "FROM node:24\nRUN echo upgraded\nRUN echo stable\nCMD start\n"
  const old = dockerfile("Dockerfile", base)
  const baseline = lockOf([old])
  const result = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", next)],
    prior: baseline,
    files: new Map([["Dockerfile", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(result.files).toEqual([])
  expect(result.warnings).toEqual([
    "Dockerfile (near baseline line 2): preserved an application edit; skipped Confgen's updated text.",
  ])
  expect(result.lock.contributions).toContainEqual({
    id: "Dockerfile",
    source: "preset:docker",
    path: "Dockerfile",
    strategy: "dockerfile",
    baseline: next,
  })
})

test("adopts an existing Dockerfile without overwriting it", () => {
  const existing = "FROM custom:latest\n"
  const result = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", "FROM node:24\n")],
    prior: undefined,
    files: new Map([["Dockerfile", existing]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(result.files).toEqual([])
  expect(result.warnings).toEqual([
    "Dockerfile: adopted existing application Dockerfile as application-owned text.",
  ])
})

test("orders generated and application insertions as whole blocks", () => {
  const result = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", "A\nD\nB\n")],
    prior: lockOf([dockerfile("Dockerfile", "A\nB\n")]),
    files: new Map([["Dockerfile", "A\nC\nB\n"]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(writtenContents(result.files, "Dockerfile")).toBe("A\nD\nC\nB\n")
  expect(result.warnings).toEqual([])
})

test("combines adjacent insertions when Confgen removes their baseline anchor", () => {
  const result = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", "A\nD\nB\n")],
    prior: lockOf([dockerfile("Dockerfile", "A\nold\nB\n")]),
    files: new Map([["Dockerfile", "A\nC\nold\nB\n"]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(writtenContents(result.files, "Dockerfile")).toBe("A\nD\nC\nB\n")
  expect(result.warnings).toEqual([])
})

test("migrates matching and modified legacy Dockerfile locks", () => {
  const base = "FROM node:24\n"
  const next = "FROM node:25\n"
  const legacy = lockOf([whole("Dockerfile", base)])
  const matching = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", next)],
    prior: legacy,
    files: new Map([["Dockerfile", base]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(writtenContents(matching.files, "Dockerfile")).toBe(next)

  const modified = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", next)],
    prior: legacy,
    files: new Map([["Dockerfile", "FROM custom:latest\n"]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(modified.files).toEqual([])
  expect(modified.warnings).toEqual([
    "Dockerfile: adopted modified legacy Dockerfile as application-owned text.",
  ])
})

test("preserves Dockerfile deletions and removes unchanged deselected files", () => {
  const current = "FROM node:24\n"
  const prior = lockOf([dockerfile("Dockerfile", current)])
  const deleted = reconcile({
    selection,
    contributions: [dockerfile("Dockerfile", "FROM node:25\n")],
    prior,
    files: new Map(),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(deleted.files).toEqual([])

  const removed = reconcile({
    selection,
    contributions: [],
    prior,
    files: new Map([["Dockerfile", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(removed.files).toEqual([{ type: "remove", path: "Dockerfile" }])
})

test("preserves application JSON values on first adoption", () => {
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
  expect(replaced.files).toEqual([])
})

test("migrates the package manager when adopting the Yarn preset", () => {
  const result = reconcile({
    selection,
    contributions: [
      {
        id: "yarn:package-manager",
        source: "preset:yarn",
        kind: "structured",
        path: "package.json",
        format: "json",
        address: ["packageManager"],
        value: "yarn@4.11.0",
        update: "replace",
      },
    ],
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "example", "packageManager": "yarn@1.22.19" }\n',
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })

  expect(
    JSON.parse(writtenContents(result.files, "package.json"))
  ).toMatchObject({
    packageManager: "yarn@4.11.0",
  })
  expect(result.runYarnInstall).toBe(true)
})

test("merge leaves an existing scalar setting intact on every run", () => {
  const current = '{ "module": "Preserve" }\n'
  const first = reconcile({
    selection,
    contributions: [
      structured(["module"], "NodeNext", "merge", "tsconfig.json"),
    ],
    prior: undefined,
    files: new Map([["tsconfig.json", current]]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(first.files).toEqual([])
})

test("preserves an application dependency range on first adoption", () => {
  const result = reconcile({
    selection,
    contributions: [dependency("typescript", "5.9.3")],
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "example", "devDependencies": { "typescript": "^5.8.0" } }\n',
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })

  expect(result.files).toEqual([])
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

test("preserves existing YAML leaves while adding missing configuration", () => {
  const result = reconcile({
    selection,
    contributions: [
      {
        id: "yaml-service",
        source: "preset:docker",
        kind: "structured",
        path: "compose.yaml",
        format: "yaml",
        address: ["services"],
        value: {
          api: {
            image: "generated:tag",
            environment: { PACKAGE_SERVICE_URL: "https://package.test" },
          },
        },
        update: "merge",
      },
    ],
    prior: undefined,
    files: new Map([
      ["compose.yaml", "services:\n  api:\n    image: application:image\n"],
      ["package.json", '{ "name": "example" }\n'],
      ["tsconfig.json", "{}\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })

  const contents = writtenContents(result.files, "compose.yaml")
  expect(contents).toContain("application:image")
  expect(contents).toContain("PACKAGE_SERVICE_URL")
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

function dockerfile(path: string, contents: string): Contribution {
  return {
    id: path,
    source: "preset:docker",
    kind: "dockerfile",
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
  value: JsonValue,
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
