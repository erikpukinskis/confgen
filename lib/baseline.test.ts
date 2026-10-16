import { collectContributions, type Contribution } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
import { reconcile } from "./reconcile.js"
import { parseSelection } from "./selection.js"
import { expect, test } from "vitest"

const root = {
  path: "package.json",
  name: "baseline",
  version: "0.0.0",
  workspaces: [],
  dependencies: [],
}
const facts: ProjectFacts = { root, packages: [root] }

const selection = parseSelection([
  "runtimes=#lib,#server",
  "yarn",
  "typescript",
  "vite",
  "vitest",
  "eslint",
  "prettier",
  "git",
])

test("the baseline selection reconciles to a stable file set", () => {
  const contributions = collectContributions(selection, facts)
  expect(byId(contributions, "package-manifest:build")).toMatchObject({
    kind: "package-script",
    command: "rm -rf dist && yarn build:lib && yarn build:server",
  })
  expect(paths(contributions)).toEqual(
    expect.arrayContaining([
      "lib/index.ts",
      "server/index.ts",
      "vite.lib.config.ts",
      "vite.server.config.ts",
      "vite.test.config.ts",
      ".yarnrc.yml",
      "tsconfig.json",
      ".eslintrc.json",
      ".prettierrc.json",
      ".gitignore",
    ])
  )

  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "baseline", "version": "0.0.0" }\n'],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  expect(created.runYarnInstall).toBe(true)
  const files = new Map<string, string>()
  for (const change of created.files) {
    if (change.type === "write") files.set(change.path, change.contents)
  }
  files.set("yarn.lock", "# lock\n")
  files.set(".pnp.cjs", "// pnp\n")

  const again = reconcile({
    selection,
    contributions,
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(again.files).toEqual([])
  expect(again.runYarnInstall).toBe(false)
})

function byId(
  contributions: readonly Contribution[],
  id: string
): Contribution {
  const found = contributions.find((contribution) => contribution.id === id)
  if (found === undefined) throw new Error(`missing contribution ${id}`)
  return found
}

function paths(contributions: readonly Contribution[]): string[] {
  return contributions.map((contribution) => {
    switch (contribution.kind) {
      case "dependency":
      case "package-script":
        return contribution.manifest
      case "whole-file":
      case "starter-file":
      case "structured":
      case "line":
      case "vite-config":
        return contribution.path
      default:
        return unexpected(contribution)
    }
  })
}

function unexpected(value: never): never {
  throw new Error(`Unexpected contribution ${JSON.stringify(value)}`)
}
