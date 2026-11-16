import { collectContributions } from "../contributions"
import type { ProjectFacts } from "../facts"
import { reconcile } from "../reconcile"
import { parseSelection } from "../selection"
import { expect, test } from "vitest"

const selection = parseSelection(["runtimes=#server", "yarn"])

test("unplugs the native and Compose packages declared by the project", () => {
  const root = {
    path: "package.json",
    name: "@example/schema-service",
    workspaces: [],
    dependencies: [
      "@multiplayerdb/package-service",
      "bcrypt",
      "sql.js",
      "ordinary-dependency",
    ],
  }
  const facts: ProjectFacts = { root, packages: [root] }
  const contributions = collectContributions(selection, facts)
  const metadata = contributions.filter(
    (entry) =>
      entry.kind === "structured" &&
      entry.path === "package.json" &&
      entry.address[0] === "dependenciesMeta"
  )

  expect(metadata.map((entry) => entry.id)).toEqual([
    "yarn:unplugged:@multiplayerdb/package-service",
    "yarn:unplugged:bcrypt",
    "yarn:unplugged:sql.js",
  ])
  expect(contributions).not.toContainEqual(
    expect.objectContaining({ id: "yarn:module-type" })
  )
  const moduleRoot = { ...root, type: "module" }
  expect(
    collectContributions(selection, {
      root: moduleRoot,
      packages: [moduleRoot],
    })
  ).toContainEqual(expect.objectContaining({ id: "yarn:module-type" }))
})

test("adds workspace TypeScript settings without removing existing VS Code settings", () => {
  const root = {
    path: "package.json",
    name: "@example/service",
    workspaces: [],
    dependencies: [],
  }
  const facts: ProjectFacts = { root, packages: [root] }
  const result = reconcile({
    selection: parseSelection(["runtimes=#server", "yarn", "vscode"]),
    contributions: collectContributions(
      parseSelection(["runtimes=#server", "yarn", "vscode"]),
      facts
    ),
    prior: undefined,
    files: new Map([
      ["package.json", '{"name":"@example/service"}\n'],
      [".vscode/settings.json", '{"editor.tabSize":2}\n'],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const settings = result.files.find(
    (change) =>
      change.type === "write" && change.path === ".vscode/settings.json"
  )
  if (settings?.type !== "write") throw new Error("settings were not written")
  expect(JSON.parse(settings.contents)).toEqual({
    "editor.tabSize": 2,
    "typescript.tsdk": ".yarn/sdks/typescript/lib",
    "typescript.enablePromptUseWorkspaceTsdk": true,
  })
  const manifest = result.files.find(
    (change) => change.type === "write" && change.path === "package.json"
  )
  if (manifest?.type !== "write") throw new Error("manifest was not written")
  expect(JSON.parse(manifest.contents)).toMatchObject({
    engines: { node: "24.22.1", yarn: "4.18.1" },
    packageManager: "yarn@4.18.1",
    devDependencies: { "@yarnpkg/sdks": "2" },
    scripts: {
      "install:sdks": "sdks vscode",
      "postinstall": "yarn install:sdks",
    },
  })
})

test.each([["yarn"], ["vscode"]])(
  "does not configure SDKs with only the %s preset",
  (preset) => {
    const root = {
      path: "package.json",
      name: "@example/service",
      workspaces: [],
      dependencies: [],
    }
    const contributions = collectContributions(
      parseSelection(["runtimes=#server", preset]),
      { root, packages: [root] }
    )
    expect(contributions).not.toContainEqual(
      expect.objectContaining({ package: "@yarnpkg/sdks" })
    )
    expect(contributions).not.toContainEqual(
      expect.objectContaining({ name: "install:sdks" })
    )
    expect(contributions).not.toContainEqual(
      expect.objectContaining({ name: "postinstall" })
    )
    expect(contributions).not.toContainEqual(
      expect.objectContaining({ path: ".vscode/settings.json" })
    )
  }
)
