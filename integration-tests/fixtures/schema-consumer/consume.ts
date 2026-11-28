import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { initialMigration } from "@example/schema-service"
import { createSchemaServiceTestKit } from "@example/schema-service/test-kit"
import { Greeting } from "@example/schema-service-client"

const rootSource = readFileSync(
  fileURLToPath(import.meta.resolve("@example/schema-service")),
  "utf8",
)
if (
  rootSource.includes("createSchemaServiceTestKit") ||
  rootSource.includes("graphql-dev-kit/test")
) {
  throw new Error("root entry loads the test kit")
}
if (!initialMigration.includes("CREATE TABLE example")) {
  throw new Error("missing migration")
}

const kit = await createSchemaServiceTestKit()
const data = await kit.operations.query(Greeting, { name: "package" })
if (data.greeting !== "Hello, package") {
  throw new Error(`unexpected GraphQL response: ${JSON.stringify(data)}`)
}
console.log("consumed")
