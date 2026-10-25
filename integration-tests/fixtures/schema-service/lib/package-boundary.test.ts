import { PublishPackage } from "@multiplayerdb/package-service-client"
import { expect, test } from "vitest"

test("loads the published Package Service client document", () => {
  expect(PublishPackage.kind).toBe("Document")
})
