import { expect, test } from "vitest"
import { initialMigration } from "#lib/data/migration"

test("loads the SQL migration source", () => {
  expect(initialMigration).toContain("CREATE TABLE example")
})
