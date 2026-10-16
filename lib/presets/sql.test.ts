import { collectContributions } from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import { parseSelection } from "../selection.js"
import { expect, test } from "vitest"

const root = {
  path: "package.json",
  name: "@example/schema-service",
  workspaces: [],
  dependencies: [],
}
const facts: ProjectFacts = { root, packages: [root] }

test("provides SQL source typing and the Vite transform dependency", () => {
  const contributions = collectContributions(
    parseSelection(["runtimes=#lib", "sql"]),
    facts
  )

  expect(contributions).toContainEqual({
    id: "sql:dependency:vite-plugin-sql",
    source: "preset:sql",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: "vite-plugin-sql",
    range: "0.1.0",
  })
  expect(contributions).toContainEqual(
    expect.objectContaining({
      id: "sql:declaration",
      kind: "starter-file",
      path: "lib/migrations/sqlite.d.ts",
    })
  )
})
