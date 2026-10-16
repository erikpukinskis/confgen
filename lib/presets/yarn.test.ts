import { collectContributions } from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import { parseSelection } from "../selection.js"
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
    collectContributions(selection, { root: moduleRoot, packages: [moduleRoot] })
  ).toContainEqual(expect.objectContaining({ id: "yarn:module-type" }))
})
