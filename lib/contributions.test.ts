import {
  normalizeContributions,
  type Contribution,
  type ContributionSource,
  type ViteConfigItem,
} from "./contributions.js"
import { ConfgenError } from "./errors.js"
import { expect, test } from "vitest"

test("orders contributions by the runtime and preset registries", () => {
  const shuffled = [
    script("preset:vitest", "test-script", "vitest run"),
    wholeFile("runtime:server", "server-file", "server/index.ts"),
    dependency("preset:typescript", "typescript-dep", "typescript", "^5"),
    wholeFile("runtime:lib", "lib-file", "lib/index.ts"),
    dependency("preset:yarn", "yarn-dep", "yarn", "4.11.0"),
  ]

  expect(ids(normalizeContributions(shuffled))).toEqual([
    "lib-file",
    "server-file",
    "yarn-dep",
    "typescript-dep",
    "test-script",
  ])
  expect(ids(normalizeContributions([...shuffled].reverse()))).toEqual(
    ids(normalizeContributions(shuffled))
  )
})

test("keeps compatible declarations and non-overlapping addresses", () => {
  const contributions = [
    dependency("preset:react", "react-vite", "vite", "^6", "devDependencies"),
    dependency("preset:vite", "vite-vite", "vite", "^6", "devDependencies"),
    dependency("preset:vite", "vite-react", "react", "^19", "dependencies"),
    structured("preset:typescript", "tsconfig-target", [
      "compilerOptions",
      "target",
    ]),
    structured("preset:typescript", "tsconfig-strict", [
      "compilerOptions",
      "strict",
    ]),
    script("preset:eslint", "lint-script", "eslint ."),
    script("preset:vitest", "test-script", "vitest run"),
  ]

  expect(ids(normalizeContributions(contributions))).toEqual([
    "tsconfig-strict",
    "tsconfig-target",
    "vite-react",
    "vite-vite",
    "test-script",
    "lint-script",
  ])
})

test("reports identity and overlap problems together", () => {
  const error = contributionError([
    wholeFile("runtime:lib", "dup", "lib/a.txt"),
    wholeFile("runtime:lib", "pkg-file", "package.json"),
    wholeFile("runtime:server", "dup", "server/b.txt"),
    structured("preset:yarn", "pkg-struct", ["private"], "package.json"),
    structured("preset:typescript", "addr-a", ["compilerOptions"]),
    structured("preset:typescript", "addr-b", ["compilerOptions", "strict"]),
    dependency("preset:vite", "dep-a", "vite", "^6"),
    dependency("preset:vitest", "dep-b", "vite", "^7"),
    script("preset:eslint", "script-a", "eslint .", "lint"),
    script("preset:prettier", "script-b", "prettier --check .", "lint"),
    viteConfig("preset:vite", "vite-a", [
      vitePlugin("preset:vite", "plugin:react"),
    ]),
    viteConfig("preset:react", "vite-b", [
      vitePlugin("preset:react", "plugin:react"),
    ]),
  ])

  expect(error.problems).toEqual([
    'Duplicate contribution "dup".',
    'Dependency "vite" in package.json devDependencies has ranges "^6" and "^7".',
    'Package script "lint" in package.json has commands "eslint ." and "prettier --check .".',
    'whole-file and structured cannot share "package.json".',
    'whole-file and dependency cannot share "package.json".',
    'whole-file and package-script cannot share "package.json".',
    'Structured addresses overlap in "tsconfig.json": compilerOptions and compilerOptions.strict.',
    'Duplicate Vite configuration item "plugin:react" in vite.config.ts.',
  ])
})

test("rejects a starter file that shares its path", () => {
  expect(
    contributionError([
      starterFile("runtime:server", "starter", "server/index.ts"),
      line("preset:git", "generated-line", "server/index.ts"),
    ]).problems
  ).toEqual(['starter-file and line cannot share "server/index.ts".'])
})

function ids(contributions: readonly Contribution[]): string[] {
  return contributions.map((contribution) => contribution.id)
}

function contributionError(
  contributions: readonly Contribution[]
): ConfgenError {
  try {
    normalizeContributions(contributions)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a contribution error")
}

function wholeFile(
  source: ContributionSource,
  id: string,
  path: string
): Contribution {
  return { id, source, kind: "whole-file", path, contents: "" }
}

function starterFile(
  source: ContributionSource,
  id: string,
  path: string
): Contribution {
  return { id, source, kind: "starter-file", path, contents: "" }
}

function line(
  source: ContributionSource,
  id: string,
  path: string
): Contribution {
  return { id, source, kind: "line", path, value: "" }
}

function structured(
  source: ContributionSource,
  id: string,
  address: readonly (string | number)[],
  path = "tsconfig.json"
): Contribution {
  return {
    id,
    source,
    kind: "structured",
    path,
    format: "json",
    address,
    value: true,
    update: "replace",
  }
}

function dependency(
  source: ContributionSource,
  id: string,
  packageName: string,
  range: string,
  section:
    | "dependencies"
    | "devDependencies"
    | "peerDependencies" = "devDependencies"
): Contribution {
  return {
    id,
    source,
    kind: "dependency",
    manifest: "package.json",
    section,
    package: packageName,
    range,
  }
}

function script(
  source: ContributionSource,
  id: string,
  command: string,
  name = id
): Contribution {
  return {
    id,
    source,
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}

function viteConfig(
  source: ContributionSource,
  id: string,
  items: readonly ViteConfigItem[]
): Contribution {
  return {
    id,
    source,
    kind: "vite-config",
    path: "vite.config.ts",
    items,
  }
}

function vitePlugin(source: ContributionSource, id: string): ViteConfigItem {
  return {
    id,
    source,
    kind: "plugin",
    importId: id,
    arguments: [],
  }
}
